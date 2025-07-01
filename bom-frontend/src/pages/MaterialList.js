// src/pages/MaterialList.js (最终完整版)
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Select, Spin, Upload, Popover, Dropdown, Menu, Typography } from 'antd';
import { MoreOutlined, DownloadOutlined, UploadOutlined, EditOutlined, DeleteOutlined, PlusOutlined, FileTextOutlined, AppstoreOutlined, FileZipOutlined } from '@ant-design/icons';
import api from '../api';
import BomManagerDrawer from './BomManagerDrawer';
import DrawingManagerDrawer from './DrawingManagerDrawer';

const { Option } = Select;
const { Text } = Typography;

const MaterialList = () => {
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [currentSearch, setCurrentSearch] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [form] = Form.useForm();
    const [exporting, setExporting] = useState(false);
    const [exportingBOM, setExportingBOM] = useState(false);
    const [suppliers, setSuppliers] = useState([]);
    const [units, setUnits] = useState([]);
    const materialCategories = ['自制', '外购', '委外', '虚拟'];
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [bomDrawerVisible, setBomDrawerVisible] = useState(false);
    const [drawingDrawerVisible, setDrawingDrawerVisible] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [sorter, setSorter] = useState({ field: 'material_code', order: 'ascend' });

    const fetchMaterials = useCallback(async (pageToFetch, searchValue, newSearch, currentSorter) => {
        if (loading && !newSearch) return;
        setLoading(true);
        try {
            const response = await api.get('/materials', {
                params: {
                    page: pageToFetch,
                    limit: 50,
                    search: searchValue,
                    sortBy: currentSorter.field,
                    sortOrder: currentSorter.order === 'descend' ? 'desc' : 'asc',
                }
            });
            const { data, hasMore: newHasMore } = response.data;
            setMaterials(prev => newSearch ? data : [...prev, ...data.filter(item => !prev.find(p => p.id === item.id))]);
            setHasMore(newHasMore);
            if (newHasMore) setPage(pageToFetch + 1);
        } catch (error) { message.error('加载物料列表失败'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        fetchMaterials(1, currentSearch, true, sorter);
    }, [currentSearch, sorter, fetchMaterials]);

    useEffect(() => {
        Promise.all([api.get('/suppliers'), api.get('/units')])
            .then(([suppliersRes, unitsRes]) => {
                setSuppliers(suppliersRes.data);
                setUnits(unitsRes.data);
            })
            .catch(() => message.error('加载基础数据失败'));
    }, []);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loading) {
            fetchMaterials(page, currentSearch, false, sorter);
        }
    };

    const refreshList = () => {
        setPage(1);
        fetchMaterials(1, currentSearch, true, sorter);
    };

    const handleSearch = (value) => setCurrentSearch(value);

    const handleTableChange = (pagination, filters, newSorter) => {
        const newSorterState = { field: newSorter.field || 'material_code', order: newSorter.order || 'ascend' };
        if (newSorterState.field !== sorter.field || newSorterState.order !== sorter.order) {
            setSorter(newSorterState);
        }
    };

    const showEditModal = (material = null) => {
        setEditingMaterial(material);
        form.setFieldsValue(material || { category: '外购' });
        setIsModalVisible(true);
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingMaterial) {
                // 1. 先将更新请求发送到后端
                await api.put(`/materials/${editingMaterial.id}`, values);
                message.success('更新成功');

                // 2. **核心修改：在本地更新数据，而不是调用 refreshList()**
                setMaterials(currentMaterials => {
                    // 使用 map 找到并更新被编辑的物料
                    const newMaterials = currentMaterials.map(m =>
                        m.id === editingMaterial.id ? { ...m, ...values } : m
                    );

                    // 3. （可选，但推荐）根据当前的排序规则，对本地数据进行重新排序
                    const { field, order } = sorter;
                    newMaterials.sort((a, b) => {
                        const aValue = a[field] || '';
                        const bValue = b[field] || '';
                        if (typeof aValue === 'string' && typeof bValue === 'string') {
                            if (order === 'ascend') return aValue.localeCompare(bValue);
                            return bValue.localeCompare(aValue);
                        }
                        if (aValue < bValue) return order === 'ascend' ? -1 : 1;
                        if (aValue > bValue) return order === 'ascend' ? 1 : -1;
                        return 0;
                    });

                    return newMaterials;
                });
            } else {
                // 对于新增物料，重新加载列表是可接受的
                await api.post('/materials', values);
                message.success('创建成功');
                refreshList();
            }
            setIsModalVisible(false); // 关闭模态框
        } catch (error) {
            message.error(error.response?.data?.error || '操作失败');
        }
    };

    const showDrawer = (type) => {
        const material = materials.find(m => m.id === selectedRowKeys[0]);
        if(material) {
            setSelectedMaterial(material);
            if (type === 'bom') setBomDrawerVisible(true);
            else if (type === 'drawing') setDrawingDrawerVisible(true);
        }
    };

    const handleDelete = async () => {
        try {
            await api.post('/materials/delete', { ids: selectedRowKeys });
            message.success(`成功删除 ${selectedRowKeys.length} 项`);
            setSelectedRowKeys([]);
            refreshList();
        } catch (error) { message.error(error.response?.data?.details || '删除失败'); }
    };

    const handleSelectAll = async () => {
        setLoading(true);
        try {
            const response = await api.get('/materials/all-ids', { params: { search: currentSearch } });
            setSelectedRowKeys(response.data);
        } catch (error) { message.error('获取全部物料ID失败'); }
        finally { setLoading(false); }
    };

    const handleExport = async (type) => {
        if (type === 'selected' && selectedRowKeys.length === 0) return message.warning('请至少选择一项进行导出。');
        setExporting(true);
        try {
            const response = await api.post('/materials/export', { ids: type === 'selected' ? selectedRowKeys : [] }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Materials_Export_${Date.now()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) { message.error('导出失败'); }
        finally { setExporting(false); }
    };

    const handleExportActiveBomDrawings = async () => {
        if (selectedRowKeys.length !== 1) {
            message.warning('请选择一个物料进行导出。');
            return;
        }
        setExportingBOM(true);
        message.info('正在后台为您打包该物料的激活BOM层级图纸，请稍候...');
        try {
            const materialId = selectedRowKeys[0];
            const response = await api.post('/drawings/export-bom', { materialId }, { responseType: 'blob' });

            const contentDisposition = response.headers['content-disposition'];
            let fileName = `BOM_Drawings_Export_${Date.now()}.zip`; // 默认备用文件名

            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
                if (filenameMatch && filenameMatch[1]) {
                    fileName = decodeURIComponent(filenameMatch[1]);
                } else {
                    const fallbackMatch = contentDisposition.match(/filename="([^"]+)"/i);
                    if (fallbackMatch && fallbackMatch[1]) {
                        fileName = fallbackMatch[1];
                    }
                }
            }

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            const errorMsg = await error.response?.data?.text?.() || error.response?.data?.error || '导出BOM层级图纸失败';
            message.error(errorMsg);
        } finally {
            setExportingBOM(false);
        }
    };

    const uploadProps = {
        name: 'file',
        action: `${api.defaults.baseURL}/materials/import`,
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') setUploading(true);
            if (info.file.status === 'done') {
                setUploading(false);
                setIsImportModalVisible(false);
                message.success(info.file.response.message || '导入成功');
                refreshList();
            } else if (info.file.status === 'error') {
                setUploading(false);
                message.error(info.file.response?.error || '导入失败');
            }
        },
    };

    const columns = [
        { title: '物料编号', dataIndex: 'material_code', key: 'material_code', sorter: true, showSorterTooltip: false, width: 120 },
        { title: '产品名称', dataIndex: 'name', key: 'name', sorter: true, showSorterTooltip: false, width: 150 },
        { title: '别名', dataIndex: 'alias', key: 'alias', width: 120 },
        { title: '规格描述', dataIndex: 'spec', key: 'spec', width: 300, render: (text) => text && text.length > 20 ? <Popover content={<div style={{width: 300, whiteSpace: 'pre-wrap'}}>{text}</div>}><span style={{cursor: 'pointer'}}>{text.substring(0, 20)}...</span></Popover> : text },
        { title: '物料属性', dataIndex: 'category', key: 'category', sorter: true, showSorterTooltip: false, width: 100 },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
        { title: '供应商', dataIndex: 'supplier', key: 'supplier', sorter: true, showSorterTooltip: false, width: 120 },
        { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, render: (text) => text && text.length > 20 ? <Popover content={<div style={{width: 300, whiteSpace: 'pre-wrap'}}>{text}</div>}><span style={{cursor: 'pointer'}}>{text.substring(0, 20)}...</span></Popover> : text },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: setSelectedRowKeys,
        selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE, { key: 'selectAllData', text: '选择所有数据', onSelect: handleSelectAll }],
    };

    const moreMenu = (
        <Menu>
            <Menu.Item key="import" icon={<UploadOutlined />} onClick={() => setIsImportModalVisible(true)}>
                批量导入物料
            </Menu.Item>
            <Menu.Item key="export" icon={<DownloadOutlined />} disabled={selectedRowKeys.length === 0} onClick={() => handleExport('selected')}>
                导出选中(Excel)
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item key="export-bom-drawings" icon={<FileZipOutlined />} disabled={selectedRowKeys.length !== 1} loading={exportingBOM} onClick={handleExportActiveBomDrawings}>
                导出激活BOM图纸
            </Menu.Item>
        </Menu>
    );

    const renderToolbar = () => {
        const hasSelected = selectedRowKeys.length > 0;
        const singleSelected = selectedRowKeys.length === 1;

        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <Input.Search placeholder="搜索..." onSearch={handleSearch} style={{ width: 250 }} allowClear />
                    {hasSelected && <Text strong>已选择 {selectedRowKeys.length} 项</Text>}
                </Space>
                <Space>
                    {hasSelected && (
                        <>
                            <Button icon={<EditOutlined />} onClick={() => showEditModal(materials.find(m => m.id === selectedRowKeys[0]))} disabled={!singleSelected}>编辑</Button>
                            <Button icon={<AppstoreOutlined />} onClick={() => showDrawer('bom')} disabled={!singleSelected}>BOM</Button>
                            <Button icon={<FileTextOutlined />} onClick={() => showDrawer('drawing')} disabled={!singleSelected}>图纸</Button>
                            <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                        </>
                    )}
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditModal()}>新增物料</Button>
                    <Dropdown overlay={moreMenu} >
                        <Button icon={<MoreOutlined />}>更多</Button>
                    </Dropdown>
                </Space>
            </div>
        );
    };

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>{renderToolbar()}</div>
            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table rowKey="id" columns={columns} dataSource={materials} rowSelection={rowSelection} pagination={false} sticky size="small" onChange={handleTableChange} onRow={(record) => ({ onClick: () => { if (!window.getSelection().toString()) setSelectedRowKeys([record.id]); }})} footer={() => (<>{loading && materials.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)} {!loading && !hasMore && materials.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}</>)}/>
            </div>
            <Modal title={editingMaterial ? '编辑物料' : '新增物料'} open={isModalVisible} onOk={handleModalOk} onCancel={() => setIsModalVisible(false)} destroyOnClose>
                <Form form={form} layout="vertical">
                    <Form.Item name="material_code" label="物料编码" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="name" label="产品名称" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="alias" label="别名"><Input /></Form.Item>
                    <Form.Item name="spec" label="规格描述"><Input.TextArea /></Form.Item>
                    <Form.Item name="category" label="物料属性" rules={[{ required: true }]}><Select>{materialCategories.map(c => <Option key={c} value={c}>{c}</Option>)}</Select></Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true }]}><Select showSearch>{units.map(u => <Option key={u.id} value={u.name}>{u.name}</Option>)}</Select></Form.Item>
                    <Form.Item name="supplier" label="供应商"><Select showSearch>{suppliers.map(s => <Option key={s.id} value={s.name}>{s.name}</Option>)}</Select></Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                </Form>
            </Modal>
            <Modal title="批量导入物料" open={isImportModalVisible} onCancel={() => setIsImportModalVisible(false)} footer={null}>
                <p>文件第一行为表头，必须包含: <strong>物料编码, 产品名称</strong>。</p>
                <a href={`${api.defaults.baseURL}/materials/template`} download>下载模板文件</a>
                <br /><br />
                <Upload {...uploadProps}><Button icon={<UploadOutlined />} style={{width: '100%'}} loading={uploading}>{uploading ? '上传中...' : '选择文件并开始导入'}</Button></Upload>
            </Modal>
            {selectedMaterial && <BomManagerDrawer visible={bomDrawerVisible} onClose={() => {setBomDrawerVisible(false); setSelectedMaterial(null);}} material={selectedMaterial} />}
            {selectedMaterial && <DrawingManagerDrawer visible={drawingDrawerVisible} onClose={() => {setDrawingDrawerVisible(false); setSelectedMaterial(null);}} material={selectedMaterial} />}
        </div>
    );
};
export default MaterialList;