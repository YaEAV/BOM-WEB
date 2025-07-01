// src/pages/UnitList.js (完全替换)
import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../api';

const UnitList = () => {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);
    const [form] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const fetchUnits = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get('/units');
            setUnits(response.data);
        } catch (error) { message.error('加载单位列表失败'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchUnits(); }, [fetchUnits]);

    const showModal = (unit = null) => {
        setEditingUnit(unit);
        form.setFieldsValue(unit || { name: '' });
        setIsModalVisible(true);
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingUnit) {
                await api.put(`/units/${editingUnit.id}`, values);
                message.success('更新成功');
            } else {
                await api.post('/units', values);
                message.success('创建成功');
            }
            setIsModalVisible(false);
            fetchUnits();
        } catch (error) { message.error(error.response?.data?.error || '操作失败'); }
    };

    const handleDelete = async () => {
        try {
            await Promise.all(selectedRowKeys.map(id => api.delete(`/units/${id}`)));
            message.success(`成功删除 ${selectedRowKeys.length} 个单位`);
            setSelectedRowKeys([]);
            fetchUnits();
        } catch (error) { message.error(error.response?.data?.error || '删除失败'); }
    };

    const columns = [{ title: '单位名称', dataIndex: 'name', key: 'name' }];

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
                        <Button icon={<EditOutlined />} disabled={selectedRowKeys.length !== 1} onClick={() => showModal(units.find(u => u.id === selectedRowKeys[0]))}>编辑</Button>
                        <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                    </>
                )}
                <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>新增单位</Button>
            </Space>
        </div>
    );

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>{renderToolbar()}</div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={units}
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
            <Modal title={editingUnit ? '编辑单位' : '新增单位'} open={isModalVisible} onOk={handleOk} onCancel={() => setIsModalVisible(false)} destroyOnClose>
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label="单位名称" rules={[{ required: true }]}><Input /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
};
export default UnitList;