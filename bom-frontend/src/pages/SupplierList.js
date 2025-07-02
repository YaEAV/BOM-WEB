// src/pages/SupplierList.js (已更新为无限滚动和统一交互)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space, Typography, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../api';

const SupplierList = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [form] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const scrollableDivRef = useRef(null);

    const fetchSuppliers = useCallback(async (pageToFetch, isNewSearch) => {
        if (loading && !isNewSearch) return;
        setLoading(true);
        try {
            // 假设后端 /suppliers 接口支持分页
            const response = await api.get('/suppliers', { params: { page: pageToFetch, limit: 50 } });
            // 假设后端返回格式为 { data, hasMore }
            const { data, hasMore: newHasMore } = response.data;
            setSuppliers(prev => isNewSearch ? data : [...prev, ...data.filter(item => !prev.find(p => p.id === item.id))]);
            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) { message.error('加载供应商列表失败'); }
        finally { setLoading(false); }
    }, [loading]); // 移除 page 依赖

    useEffect(() => {
        fetchSuppliers(1, true);
    }, []); // 初始加载

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loading) {
            fetchSuppliers(page, false);
        }
    };

    const refreshList = () => {
        setPage(1);
        setSuppliers([]);
        fetchSuppliers(1, true);
    };

    const showModal = (supplier = null) => {
        setEditingSupplier(supplier);
        form.setFieldsValue(supplier || { name: '', contact: '', phone: '', address: '', remark: '' });
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingSupplier(null);
        form.resetFields();
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingSupplier) {
                await api.put(`/suppliers/${editingSupplier.id}`, values);
                message.success('更新成功');
            } else {
                await api.post('/suppliers', values);
                message.success('创建成功');
            }
            handleCancel();
            refreshList(); // 刷新整个列表
        } catch (error) { message.error(error.response?.data?.error || '操作失败'); }
    };

    const handleDelete = async () => {
        try {
            await api.post(`/suppliers/delete`, { ids: selectedRowKeys });
            message.success(`成功删除 ${selectedRowKeys.length} 个供应商`);
            setSelectedRowKeys([]);
            refreshList();
        } catch (error) { message.error(error.response?.data?.error || '删除失败'); }
    };

    const columns = [
        { title: '供应商名称', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
        { title: '联系人', dataIndex: 'contact', key: 'contact' },
        { title: '电话', dataIndex: 'phone', key: 'phone' },
        { title: '地址', dataIndex: 'address', key: 'address' },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys) => setSelectedRowKeys(keys),
    };

    const renderToolbar = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                {selectedRowKeys.length > 0 && <Typography.Text strong>已选择 {selectedRowKeys.length} 项</Typography.Text>}
            </div>
            <Space>
                <Button icon={<EditOutlined />} disabled={selectedRowKeys.length !== 1} onClick={() => showModal(suppliers.find(s => s.id === selectedRowKeys[0]))}>编辑</Button>
                <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete} disabled={selectedRowKeys.length === 0}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>新增供应商</Button>
            </Space>
        </div>
    );

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>{renderToolbar()}</div>
            <div id="scrollableDiv" ref={scrollableDivRef} onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={suppliers}
                    rowKey="id"
                    loading={loading && suppliers.length === 0}
                    rowSelection={rowSelection}
                    onRow={(record) => ({
                        onClick: () => {
                            if (window.getSelection().toString()) return;
                            setSelectedRowKeys([record.id]);
                        }
                    })}
                    pagination={false}
                    sticky
                    footer={() => (
                        <>
                            {loading && suppliers.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && suppliers.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>
            <Modal title={editingSupplier ? '编辑供应商' : '新增供应商'} open={isModalVisible} onOk={handleOk} onCancel={handleCancel} destroyOnClose>
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="contact" label="联系人"><Input /></Form.Item>
                    <Form.Item name="phone" label="电话"><Input /></Form.Item>
                    <Form.Item name="address" label="地址"><Input.TextArea /></Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SupplierList;