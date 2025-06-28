import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space } from 'antd';
import api from '../api';

const SupplierList = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [form] = Form.useForm();

    const fetchSuppliers = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/suppliers');
            setSuppliers(response.data);
        } catch (error) {
            message.error('加载供应商列表失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSuppliers();
    }, [fetchSuppliers]);

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
                message.success('供应商更新成功');
            } else {
                await api.post('/suppliers', values);
                message.success('供应商创建成功');
            }
            handleCancel();
            fetchSuppliers();
        } catch (error) {
            message.error('操作失败，请检查供应商名称是否重复');
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/suppliers/${id}`);
            message.success('供应商删除成功');
            fetchSuppliers();
        } catch (error) {
            message.error('删除失败，请检查该供应商是否仍被物料引用');
        }
    };

    const columns = [
        { title: '供应商名称', dataIndex: 'name', key: 'name' },
        { title: '联系人', dataIndex: 'contact', key: 'contact' },
        { title: '电话', dataIndex: 'phone', key: 'phone' },
        { title: '地址', dataIndex: 'address', key: 'address' },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <Space size="middle">
                    <a onClick={() => showModal(record)}>编辑</a>
                    <Popconfirm title="确定要删除吗?" onConfirm={() => handleDelete(record.id)}>
                        <a>删除</a>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Button type="primary" onClick={() => showModal()} style={{ marginBottom: 16 }}>
                新增供应商
            </Button>
            <Table
                columns={columns}
                dataSource={suppliers}
                rowKey="id"
                loading={loading}
                bordered
            />
            <Modal
                title={editingSupplier ? '编辑供应商' : '新增供应商'}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称!' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="contact" label="联系人">
                        <Input />
                    </Form.Item>
                    <Form.Item name="phone" label="电话">
                        <Input />
                    </Form.Item>
                    <Form.Item name="address" label="地址">
                        <Input.TextArea />
                    </Form.Item>
                    <Form.Item name="remark" label="备注">
                        <Input.TextArea />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default SupplierList;