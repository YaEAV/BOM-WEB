// src/pages/UnitList.js (已更新为无限滚动和统一交互)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Space, Typography, Spin } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import api from '../api';

const UnitList = () => {
    const [units, setUnits] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);
    const [form] = Form.useForm();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const scrollableDivRef = useRef(null);

    const fetchUnits = useCallback(async (pageToFetch, isNewSearch) => {
        if (loading && !isNewSearch) return;
        setLoading(true);
        try {
            // 假设后端 /units 接口支持分页
            const response = await api.get('/units', { params: { page: pageToFetch, limit: 50 } });
            // 假设后端返回格式为 { data, hasMore }
            const { data, hasMore: newHasMore } = response.data;
            setUnits(prev => isNewSearch ? data : [...prev, ...data.filter(item => !prev.find(p => p.id === item.id))]);
            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) { message.error('加载单位列表失败'); }
        finally { setLoading(false); }
    }, [loading]);

    useEffect(() => {
        fetchUnits(1, true);
    }, []);

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loading) {
            fetchUnits(page, false);
        }
    };

    const refreshList = () => {
        setPage(1);
        setUnits([]);
        fetchUnits(1, true);
    };

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
            refreshList();
        } catch (error) { message.error(error.response?.data?.error || '操作失败'); }
    };

    const handleDelete = async () => {
        try {
            await api.post(`/units/delete`, { ids: selectedRowKeys });
            message.success(`成功删除 ${selectedRowKeys.length} 个单位`);
            setSelectedRowKeys([]);
            refreshList();
        } catch (error) { message.error(error.response?.data?.error || '删除失败'); }
    };

    const columns = [{ title: '单位名称', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) }];

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
                <Button icon={<EditOutlined />} disabled={selectedRowKeys.length !== 1} onClick={() => showModal(units.find(u => u.id === selectedRowKeys[0]))}>编辑</Button>
                <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete} disabled={selectedRowKeys.length === 0}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>新增单位</Button>
            </Space>
        </div>
    );

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>{renderToolbar()}</div>
            <div id="scrollableDiv" ref={scrollableDivRef} onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={units}
                    rowKey="id"
                    loading={loading && units.length === 0}
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
                            {loading && units.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && units.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
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