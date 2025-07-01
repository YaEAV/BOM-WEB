// src/pages/SupplierList.js (完全替换)

import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../api';

const SupplierList = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [form] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const fetchSuppliers = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/suppliers');
            setSuppliers(response.data);
        } catch (error) { message.error('加载供应商列表失败'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

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
            fetchSuppliers();
        } catch (error) { message.error(error.response?.data?.error || '操作失败'); }
    };

    const handleDelete = async () => {
        try {
            // 后端暂不支持批量删除，这里循环处理
            await Promise.all(selectedRowKeys.map(id => api.delete(`/suppliers/${id}`)));
            message.success(`成功删除 ${selectedRowKeys.length} 个供应商`);
            setSelectedRowKeys([]);
            fetchSuppliers();
        } catch (error) { message.error(error.response?.data?.error || '删除失败'); }
    };

    const columns = [
        { title: '供应商名称', dataIndex: 'name', key: 'name' },
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
                {selectedRowKeys.length > 0 && (
                    <>
                        <Button icon={<EditOutlined />} disabled={selectedRowKeys.length !== 1} onClick={() => showModal(suppliers.find(s => s.id === selectedRowKeys[0]))}>编辑</Button>
                        <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                    </>
                )}
                <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>新增供应商</Button>
            </Space>
        </div>
    );

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>{renderToolbar()}</div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={suppliers}
                    rowKey="id"
                    loading={loading}
                    rowSelection={rowSelection}
                    onRow={(record) => ({ onClick: () => {
                            const keys = selectedRowKeys.includes(record.id) ? selectedRowKeys.filter(k => k !== record.id) : [...selectedRowKeys, record.id];
                            setSelectedRowKeys(keys);
                        }})}
                    pagination={{ pageSize: 10 }}
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