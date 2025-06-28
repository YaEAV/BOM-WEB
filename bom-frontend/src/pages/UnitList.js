import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space } from 'antd';
import api from '../api';

const UnitList = () => {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);
    const [form] = Form.useForm();

    const fetchUnits = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/units');
            setUnits(response.data);
        } catch (error) {
            message.error('加载单位列表失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUnits();
    }, [fetchUnits]);

    const showModal = (unit = null) => {
        setEditingUnit(unit);
        form.setFieldsValue(unit || { name: '' });
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingUnit(null);
        form.resetFields();
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingUnit) {
                await api.put(`/units/${editingUnit.id}`, values);
                message.success('单位更新成功');
            } else {
                await api.post('/units', values);
                message.success('单位创建成功');
            }
            handleCancel();
            fetchUnits();
        } catch (error) {
            message.error('操作失败，请检查单位名称是否重复');
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/units/${id}`);
            message.success('单位删除成功');
            fetchUnits();
        } catch (error) {
            message.error('删除失败，请检查该单位是否仍被物料引用');
        }
    };

    const columns = [
        { title: '单位名称', dataIndex: 'name', key: 'name' },
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
                新增单位
            </Button>
            <Table
                columns={columns}
                dataSource={units}
                rowKey="id"
                loading={loading}
                bordered
            />
            <Modal
                title={editingUnit ? '编辑单位' : '新增单位'}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="单位名称" rules={[{ required: true, message: '请输入单位名称!' }]}>
                        <Input />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default UnitList;