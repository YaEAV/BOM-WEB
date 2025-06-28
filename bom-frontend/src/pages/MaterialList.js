import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Select, Spin, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import api from '../api';
import BomManagerDrawer from './BomManagerDrawer';

const { Option } = Select;

const MaterialList = () => {
    // --- 状态定义 (不变) ---
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
    const materialCategories = ['自制', '外购', '委外'];
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [bomDrawerVisible, setBomDrawerVisible] = useState(false);
    const [selectedMaterialForBom, setSelectedMaterialForBom] = useState(null);

    // --- 核心修复：重构数据获取和 useEffect ---
    const fetchMaterials = useCallback(async (pageToFetch, searchValue, isNewSearch = false) => {
        if (loading) return;
        setLoading(true);
        try {
            const response = await api.get('/materials', {
                params: { page: pageToFetch, limit: 50, search: searchValue }
            });
            const { data, hasMore: newHasMore } = response.data;

            setMaterials(prev => {
                const existingIds = new Set(prev.map(item => item.id));
                const newItems = data.filter(item => !existingIds.has(item.id));
                return isNewSearch ? data : [...prev, ...newItems];
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
        // 这个 effect 只在组件首次挂载时运行，用于加载初始数据
        const fetchInitialData = async () => {
            await fetchMaterials(1, '', true);
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


    // --- 滚动加载处理函数 ---
    const handleScroll = (event) => {
        const target = event.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = target;
        if (scrollHeight - scrollTop <= clientHeight + 10) {
            if (hasMore && !loading) {
                fetchMaterials(page, currentSearch);
            }
        }
    };


    // --- 其他所有功能实现 ---
    const handleSearch = (value) => {
        setCurrentSearch(value);
        setPage(1);
        setHasMore(true);
        fetchMaterials(1, value, true);
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
            handleSearch(currentSearch);
        } catch (errorInfo) { message.error('操作失败，请检查物料编码是否重复'); }
    };

    const handleDelete = async () => {
        try {
            await api.post('/materials/delete', { ids: selectedRowKeys });
            message.success('批量删除成功');
            setSelectedRowKeys([]);
            handleSearch(currentSearch);
        } catch (error) { message.error(error.response?.data?.details || '删除失败'); }
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
        action: 'http://localhost:5000/api/materials/import',
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') { setUploading(true); return; }
            setUploading(false);
            if (info.file.status === 'done') {
                setIsImportModalVisible(false);
                message.success(info.file.response.message || '文件上传成功');
                handleSearch('');
            } else if (info.file.status === 'error') {
                // --- 核心修复：现在可以显示后端传来的具体冲突信息 ---
                message.error(info.file.response?.error || '文件上传失败，请检查文件内容或联系管理员。');
            }
        },
    };

    const columns = [
        {
            title: '物料编号', dataIndex: 'material_code', key: 'material_code',
            sorter: (a, b) => a.material_code.localeCompare(b.material_code, undefined, { numeric: true, sensitivity: 'base' })
        },
        { title: '产品名称', dataIndex: 'name', key: 'name' },
        { title: '别名', dataIndex: 'alias', key: 'alias' },
        { title: '规格描述', dataIndex: 'spec', key: 'spec', width: 250 },
        { title: '物料属性', dataIndex: 'category', key: 'category' },
        { title: '单位', dataIndex: 'unit', key: 'unit' },
        { title: '供应商', dataIndex: 'supplier', key: 'supplier' },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
    ];

    const rowSelection = { selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) };

    return (
        <div style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                <Space wrap>
                    <Input.Search placeholder="搜索物料" onSearch={handleSearch} style={{ width: 250 }} allowClear />
                    <Button type="primary" onClick={() => showModal()}>新增物料</Button>
                    <Button onClick={() => setIsImportModalVisible(true)} icon={<UploadOutlined />}>批量导入</Button>
                    <Popconfirm title={`确定要删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete} disabled={selectedRowKeys.length === 0}>
                        <Button danger disabled={selectedRowKeys.length === 0}>批量删除</Button>
                    </Popconfirm>
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
                    loading={loading}
                    size="small"
                    onRow={(record) => ({ onClick: () => setSelectedRowKeys([record.id]) })}
                    footer={() => (
                        <>
                            {loading && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && materials.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>

            {/* --- 所有模态框和抽屉的渲染 --- */}
            <Modal title={editingMaterial ? '编辑物料' : '新增物料'} open={isModalVisible} onOk={handleOk} onCancel={handleCancel} destroyOnHidden width={600}>
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

            <Modal
                title="批量导入物料"
                open={isImportModalVisible}
                onCancel={handleImportCancel}
                footer={[ <Button key="back" onClick={handleImportCancel}>关闭</Button> ]}
            >
                <p>请上传符合格式要求的Excel文件 (.xlsx, .xls)。</p>
                <p>文件第一行为表头，必须包含: <strong>物料编码, 产品名称</strong>。</p>
                <a href="http://localhost:5000/api/materials/template" download>下载模板文件</a>
                <br /><br />
                <Upload {...uploadProps}>
                    <Button icon={<UploadOutlined />} style={{width: '100%'}} loading={uploading}>
                        {uploading ? '正在上传...' : '点击选择文件并开始上传'}
                    </Button>
                </Upload>
            </Modal>

            {selectedMaterialForBom && (
                <BomManagerDrawer
                    visible={bomDrawerVisible}
                    onClose={() => setBomDrawerVisible(false)}
                    material={selectedMaterialForBom}
                />
            )}
        </div>
    );
};

export default MaterialList;