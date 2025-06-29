import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Select, Spin, Upload, Popover } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api';
import BomManagerDrawer from './BomManagerDrawer';

const { Option } = Select;

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
    const [suppliers, setSuppliers] = useState([]);
    const [units, setUnits] = useState([]);
    const materialCategories = ['自制', '外购', '委外', '虚拟'];
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [bomDrawerVisible, setBomDrawerVisible] = useState(false);
    const [selectedMaterialForBom, setSelectedMaterialForBom] = useState(null);
    const [sorter, setSorter] = useState({ field: 'material_code', order: 'ascend' });


    const fetchMaterials = useCallback(async (pageToFetch, searchValue, newSearchOrSort = false, currentSorter) => {
        if (loading && !newSearchOrSort) return;
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

            setMaterials(prev => {
                if (newSearchOrSort) {
                    return data;
                }
                const existingIds = new Set(prev.map(item => item.id));
                const newItems = data.filter(item => !existingIds.has(item.id));
                return [...prev, ...newItems];
            });

            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) {
            message.error('加载物料列表失败');
        } finally {
            setLoading(false);
        }
    }, [loading]);

    useEffect(() => {
        const fetchInitialData = async () => {
            await fetchMaterials(1, '', true, sorter);
            try {
                const [suppliersRes, unitsRes] = await Promise.all([
                    api.get('/suppliers'),
                    api.get('/units')
                ]);
                setSuppliers(suppliersRes.data);
                setUnits(unitsRes.data);
            } catch (error) {
                message.error('加载基础数据失败');
            }
        };
        fetchInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    const handleScroll = (event) => {
        const target = event.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = target;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            if (hasMore && !loading) {
                fetchMaterials(page, currentSearch, false, sorter);
            }
        }
    };

    const handleSearch = (value) => {
        setCurrentSearch(value);
        setPage(1);
        setHasMore(true);
        fetchMaterials(1, value, true, sorter);
    };

    const handleTableChange = (pagination, filters, newSorter) => {
        if (newSorter.field !== sorter.field || newSorter.order !== sorter.order) {
            const newSorterState = {
                field: newSorter.field,
                order: newSorter.order || 'ascend'
            };
            setSorter(newSorterState);
            setPage(1);
            setHasMore(true);
            fetchMaterials(1, currentSearch, true, newSorterState);
        }
    };

    const showModal = (material = null) => {
        setEditingMaterial(material);
        form.setFieldsValue(material || { material_code: '', name: '', alias: '', spec: '', category: '外购', unit: '', supplier: '', remark: '' });
        setIsModalVisible(true);
    };

    const handleCancel = () => { setIsModalVisible(false); setEditingMaterial(null); form.resetFields(); };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingMaterial) {
                await api.put(`/materials/${editingMaterial.id}`, values);
                message.success('物料更新成功');
            } else {
                await api.post('/materials', values);
                message.success('物料创建成功');
            }
            handleCancel();
            fetchMaterials(1, currentSearch, true, sorter);
        } catch (errorInfo) { message.error('操作失败，请检查物料编码是否重复'); }
    };

    const handleDelete = async () => {
        try {
            await api.post('/materials/delete', { ids: selectedRowKeys });
            message.success('批量删除成功');
            setSelectedRowKeys([]);
            fetchMaterials(1, currentSearch, true, sorter);
        } catch (error) { message.error(error.response?.data?.details || '删除失败'); }
    };

    const handleSelectAll = async () => {
        try {
            setLoading(true);
            const response = await api.get('/materials/all-ids', {
                params: { search: currentSearch }
            });
            setSelectedRowKeys(response.data);
            message.success(`已选中全部 ${response.data.length} 项物料。`);
        } catch (error) {
            message.error('获取全部物料ID失败');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        if (selectedRowKeys.length === 0) return message.warning('请至少选择一项物料进行导出。');
        setExporting(true);
        try {
            const response = await api.post('/materials/export', { ids: selectedRowKeys }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Materials_Export_${Date.now()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) { message.error('导出失败'); }
        finally { setExporting(false); }
    };

    const handleImportCancel = () => setIsImportModalVisible(false);

    const handleViewBom = () => {
        const material = materials.find(m => m.id === selectedRowKeys[0]);
        if (material) {
            setSelectedMaterialForBom(material);
            setBomDrawerVisible(true);
        }
    };

    const uploadProps = {
        name: 'file',
        action: `${window.location.protocol}//${window.location.hostname}:52026/api/materials/import`,
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') { setUploading(true); return; }
            setUploading(false);
            if (info.file.status === 'done') {
                setIsImportModalVisible(false);
                message.success(info.file.response.message || '文件上传成功');
                fetchMaterials(1, '', true, sorter);
            } else if (info.file.status === 'error') {
                message.error(info.file.response?.error || '文件上传失败，请检查文件内容或联系管理员。');
            }
        },
    };

    const columns = [
        {
            title: '物料编号',
            dataIndex: 'material_code',
            key: 'material_code',
            sorter: true,
            showSorterTooltip: false,
            width: 120,
        },
        {
            title: '产品名称',
            dataIndex: 'name',
            key: 'name',
            sorter: true,
            width: 150,
        },
        {
            title: '别名',
            dataIndex: 'alias',
            key: 'alias',
            width: 120,
        },
        {
            title: '规格描述',
            dataIndex: 'spec',
            key: 'spec',
            width: 300,
            render: (text) => {
                if (!text) return null;
                const content = (
                    <Input.TextArea
                        readOnly
                        value={text}
                        autoSize={{ minRows: 3, maxRows: 8 }}
                        style={{ width: 300, cursor: 'text' }}
                    />
                );
                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {text}
                        </div>
                        <Popover content={content} title="完整规格描述" trigger="click">
                            <Button type="text" icon={<MoreOutlined />} style={{ marginLeft: 8 }} />
                        </Popover>
                    </div>
                );
            },
        },
        {
            title: '物料属性',
            dataIndex: 'category',
            key: 'category',
            sorter: true,
            width: 100,
        },
        {
            title: '单位',
            dataIndex: 'unit',
            key: 'unit',
            width: 80,
        },
        {
            title: '供应商',
            dataIndex: 'supplier',
            key: 'supplier',
            sorter: true,
            width: 120,
        },
        {
            title: '备注',
            dataIndex: 'remark',
            key: 'remark',
            width: 150,
            render: (text) => {
                if (!text) return null;
                const content = (
                    <Input.TextArea
                        readOnly
                        value={text}
                        autoSize={{ minRows: 3, maxRows: 8 }}
                        style={{ width: 300, cursor: 'text' }}
                    />
                );
                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {text}
                        </div>
                        <Popover content={content} title="完整备注" trigger="click">
                            <Button type="text" icon={<MoreOutlined />} style={{ marginLeft: 8 }} />
                        </Popover>
                    </div>
                );
            },
        },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys) => setSelectedRowKeys(keys),
        selections: [
            {
                key: 'all',
                text: '全选当页',
                onSelect: (changeableRowKeys) => {
                    setSelectedRowKeys(changeableRowKeys);
                },
            },
            {
                key: 'invert',
                text: '反选当页',
                onSelect: (changeableRowKeys) => {
                    const newSelectedRowKeys = changeableRowKeys.filter(
                        key => !selectedRowKeys.includes(key)
                    );
                    setSelectedRowKeys(newSelectedRowKeys);
                },
            },
            {
                key: 'selectAllData',
                text: '选择所有数据',
                onSelect: () => {
                    handleSelectAll();
                },
            },
            {
                key: 'unselectAllData',
                text: '清空所有选择',
                onSelect: () => {
                    setSelectedRowKeys([]);
                },
            },
        ],
    };

    return (
        <div style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                <Space wrap>
                    <Input.Search placeholder="搜索物料" onSearch={handleSearch} style={{ width: 250 }} allowClear />
                    <Button type="primary" onClick={() => showModal()}>新增物料</Button>
                    <Button onClick={() => showModal(materials.find(m => m.id === selectedRowKeys[0]))} disabled={selectedRowKeys.length !== 1}>
                        编辑物料
                    </Button>
                    <Popconfirm title={`确定要删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete} disabled={selectedRowKeys.length === 0}>
                        <Button danger disabled={selectedRowKeys.length === 0}>批量删除</Button>
                    </Popconfirm>
                    <Button onClick={() => setIsImportModalVisible(true)} icon={<UploadOutlined />}>批量导入</Button>
                    <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={selectedRowKeys.length === 0} loading={exporting}>批量导出</Button>
                    <Button onClick={handleViewBom} disabled={selectedRowKeys.length !== 1}>查看BOM</Button>
                </Space>
            </div>

            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={materials}
                    rowSelection={rowSelection}
                    pagination={false}
                    sticky
                    loading={loading && materials.length === 0}
                    size="small"
                    // --- MODIFICATION START ---
                    // 1. 实现点击行单选
                    onRow={(record) => ({
                        onClick: () => {
                            setSelectedRowKeys([record.id]);
                        },
                    })}
                    // --- MODIFICATION END ---
                    onChange={handleTableChange}
                    footer={() => (
                        <>
                            {loading && materials.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && materials.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>

            <Modal title={editingMaterial ? '编辑物料' : '新增物料'} open={isModalVisible} onOk={handleOk} onCancel={handleCancel} destroyOnClose width={600}>
                <Form form={form} layout="vertical" name="material_form">
                    <Form.Item name="material_code" label="物料编码" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="name" label="产品名称" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="alias" label="别名"><Input /></Form.Item>
                    <Form.Item name="spec" label="规格描述"><Input.TextArea /></Form.Item>
                    <Form.Item name="category" label="物料属性" rules={[{ required: true }]}>
                        <Select>
                            {materialCategories.map(cat => <Option key={cat} value={cat}>{cat}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
                        <Select showSearch optionFilterProp="children">
                            {units.map(u => <Option key={u.id} value={u.name}>{u.name}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="supplier" label="供应商">
                        <Select showSearch optionFilterProp="children">
                            {suppliers.map(s => <Option key={s.id} value={s.name}>{s.name}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                </Form>
            </Modal>

            <Modal title="批量导入物料" open={isImportModalVisible} onCancel={handleImportCancel} footer={[ <Button key="back" onClick={handleImportCancel}>关闭</Button> ]}>
                <p>请上传符合格式要求的Excel文件 (.xlsx, .xls)。</p>
                <p>文件第一行为表头，必须包含: <strong>物料编码, 产品名称</strong>。</p>
                <a href={`${window.location.protocol}//${window.location.hostname}:52026/api/materials/template`} download>下载模板文件</a>
                <br /><br />
                <Upload {...uploadProps}>
                    <Button icon={<UploadOutlined />} style={{width: '100%'}} loading={uploading}>
                        {uploading ? '正在上传...' : '点击选择文件并开始上传'}
                    </Button>
                </Upload>
            </Modal>

            {selectedMaterialForBom && ( <BomManagerDrawer visible={bomDrawerVisible} onClose={() => setBomDrawerVisible(false)} material={selectedMaterialForBom} /> )}
        </div>
    );
};

export default MaterialList;