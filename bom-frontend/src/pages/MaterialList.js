import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Spin } from 'antd';
import InfiniteScroll from 'react-infinite-scroll-component';
import api from '../api';
import BomManagerDrawer from './BomManagerDrawer'; // 1. 引入新组件

const MaterialList = () => {
    // State for Materials List
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    // State for Material Add/Edit Modal
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [form] = Form.useForm();

    // 2. State for BOM Manager Drawer
    const [bomDrawerVisible, setBomDrawerVisible] = useState(false);
    const [selectedMaterialForBom, setSelectedMaterialForBom] = useState(null);

    // Data Fetching
    const fetchMaterials = useCallback(async (currentPage, searchValue = '') => {
        if (loading && currentPage > 1) return; // Prevent multiple simultaneous fetches for infinite scroll
        setLoading(true);
        try {
            const response = await api.get('/materials', {
                params: { page: currentPage, limit: 30, search: searchValue }
            });
            const { data, hasMore: newHasMore } = response.data;
            setMaterials(prev => currentPage === 1 ? data : [...prev, ...data]);
            setHasMore(newHasMore);
            if (currentPage === 1) {
                setPage(2);
            } else {
                setPage(prev => prev + 1);
            }
        } catch (error) {
            message.error('加载物料列表失败');
        } finally {
            setLoading(false);
        }
    }, [loading]);

    useEffect(() => {
        fetchMaterials(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    const handleSearch = (value) => {
        setMaterials([]);
        setSelectedRowKeys([]);
        setHasMore(true); // Reset hasMore for new search
        fetchMaterials(1, value);
    };

    // Material Modal Handling
    const showModal = (material = null) => {
        setEditingMaterial(material);
        form.setFieldsValue(material || {
            material_code: '', name: '', alias: '', spec: '', category: '', unit: '', supplier: '', remark: ''
        });
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingMaterial(null);
        form.resetFields();
    };

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
            handleSearch(''); // Refresh list from page 1
        } catch (errorInfo) {
            message.error('操作失败，请检查物料编码是否重复或网络连接');
        }
    };

    // Action Buttons Handling
    const handleEdit = () => {
        const materialToEdit = materials.find(m => m.id === selectedRowKeys[0]);
        if (materialToEdit) {
            showModal(materialToEdit);
        }
    };

    const handleDelete = async () => {
        try {
            await api.post('/materials/delete', { ids: selectedRowKeys });
            message.success('物料删除成功');
            setSelectedRowKeys([]);
            handleSearch(''); // Refresh list from page 1
        } catch (error) {
            message.error('删除失败，可能存在网络问题或物料被引用');
        }
    };

    // 3. Handler to open the BOM Drawer
    const handleViewBom = () => {
        const material = materials.find(m => m.id === selectedRowKeys[0]);
        if (material) {
            setSelectedMaterialForBom(material);
            setBomDrawerVisible(true);
        }
    };

    // Table Columns and Selection
    const columns = [
        { title: '物料编号', dataIndex: 'material_code', key: 'material_code', width: 150 },
        { title: '产品名称', dataIndex: 'name', key: 'name', width: 150 },
        { title: '别名', dataIndex: 'alias', key: 'alias', width: 150 },
        { title: '规格描述', dataIndex: 'spec', key: 'spec', width: 200 },
        { title: '物料属性', dataIndex: 'category', key: 'category', width: 120 },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
        { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 150 },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys) => setSelectedRowKeys(keys),
    };

    return (
        <div style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                <Space>
                    <Input.Search
                        placeholder="搜索物料编号、名称或别名"
                        onSearch={handleSearch}
                        style={{ width: 300 }}
                        allowClear
                    />
                    <Button type="primary" onClick={() => showModal()}>新增物料</Button>
                    <Button onClick={handleEdit} disabled={selectedRowKeys.length !== 1}>
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定要删除选中的 ${selectedRowKeys.length} 个物料吗?`}
                        onConfirm={handleDelete}
                        okText="是"
                        cancelText="否"
                        disabled={selectedRowKeys.length === 0}
                    >
                        <Button danger disabled={selectedRowKeys.length === 0}>
                            删除
                        </Button>
                    </Popconfirm>
                    {/* 4. Update the "查看BOM" button's onClick handler */}
                    <Button onClick={handleViewBom} disabled={selectedRowKeys.length !== 1}>
                        查看BOM
                    </Button>
                </Space>
            </div>

            <div id="scrollableDiv" style={{ flex: 1, overflow: 'auto' }}>
                <InfiniteScroll
                    dataLength={materials.length}
                    next={() => fetchMaterials(page)}
                    hasMore={hasMore}
                    loader={<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>}
                    endMessage={<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>}
                    scrollableTarget="scrollableDiv"
                >
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={materials}
                        rowSelection={rowSelection}
                        pagination={false}
                        sticky
                    />
                </InfiniteScroll>
            </div>

            {/* Modal for Add/Edit Material */}
            <Modal
                title={editingMaterial ? '编辑物料' : '新增物料'}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                destroyOnClose
                width={600}
            >
                <Form form={form} layout="vertical" name="material_form">
                    <Form.Item name="material_code" label="物料编码" rules={[{ required: true, message: '请输入物料编码!' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="name" label="产品名称" rules={[{ required: true, message: '请输入产品名称!' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="alias" label="别名"><Input /></Form.Item>
                    <Form.Item name="spec" label="规格描述"><Input /></Form.Item>
                    <Form.Item name="category" label="物料属性"><Input /></Form.Item>
                    <Form.Item name="unit" label="单位"><Input /></Form.Item>
                    <Form.Item name="supplier" label="供应商"><Input /></Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>

            {/* 5. Render the BOM Manager Drawer component */}
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
