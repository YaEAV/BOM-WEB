// src/pages/VersionList.js (Fully Replaced)

import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Switch, Tag, Spin, Typography } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api';

const VersionList = () => {
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [currentSearch, setCurrentSearch] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingVersion, setEditingVersion] = useState(null);
    const [form] = Form.useForm();
    const [sorter, setSorter] = useState({ field: 'created_at', order: 'descend' });
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const fetchVersions = useCallback(async (pageToFetch, searchValue, isNewSearch, currentSorter) => {
        if (loading && !isNewSearch) return;
        setLoading(true);
        try {
            const response = await api.get('/versions', {
                params: {
                    page: pageToFetch,
                    limit: 50,
                    search: searchValue,
                    sortBy: currentSorter.field,
                    sortOrder: currentSorter.order === 'descend' ? 'desc' : 'asc',
                }
            });
            const { data, hasMore: newHasMore } = response.data;
            setVersions(prev => isNewSearch ? data : [...prev, ...data.filter(item => !prev.find(p => p.id === item.id))]);
            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) {
            message.error('加载BOM版本列表失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        api.get('/versions', {
            params: {
                page: 1,
                limit: 50,
                search: currentSearch,
                sortBy: sorter.field,
                sortOrder: sorter.order === 'descend' ? 'desc' : 'asc',
            }
        }).then(response => {
            const { data, hasMore: newHasMore } = response.data;
            setVersions(data);
            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(2);
            }
        }).catch(error => {
            message.error('加载BOM版本列表失败');
        }).finally(() => {
            setLoading(false);
        });
    }, [currentSearch, sorter]);

    const handleSearch = (value) => {
        setPage(1); // Reset page for new search
        setCurrentSearch(value);
    };

    const handleTableChange = (pagination, filters, newSorter) => {
        const newSorterState = { field: newSorter.field || 'created_at', order: newSorter.order || 'descend' };
        if (newSorterState.field !== sorter.field || newSorterState.order !== sorter.order) {
            setPage(1); // Reset page for new sort
            setSorter(newSorterState);
        }
    };

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loading) {
            fetchVersions(page, currentSearch, false, sorter);
        }
    };

    const showModal = (version) => {
        setEditingVersion(version);
        form.setFieldsValue({ remark: version.remark, is_active: version.is_active });
        setIsModalVisible(true);
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingVersion) {
                await api.put(`/versions/${editingVersion.id}`, { ...values, material_id: editingVersion.material_id });
                message.success('版本更新成功');
                setIsModalVisible(false);
                setEditingVersion(null);
                fetchVersions(1, currentSearch, true, sorter);
            }
        } catch (error) { message.error('更新失败'); }
    };

    const handleBatchDelete = async () => {
        try {
            await api.post('/versions/delete', { ids: selectedRowKeys });
            message.success(`成功删除 ${selectedRowKeys.length} 个版本`);
            setSelectedRowKeys([]);
            fetchVersions(1, currentSearch, true, sorter);
        } catch (error) { message.error(error.response?.data?.error || '批量删除失败'); }
    };

    const columns = [
        { title: '版本号', dataIndex: 'version_code', key: 'version_code', sorter: true, showSorterTooltip: false },
        { title: '所属物料编码', dataIndex: 'material_code', key: 'material_code', sorter: true, showSorterTooltip: false },
        { title: '所属物料名称', dataIndex: 'material_name', key: 'material_name' },
        { title: '激活状态', dataIndex: 'is_active', key: 'is_active', render: (isActive) => isActive ? <Tag color="green">已激活</Tag> : <Tag>未激活</Tag> },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
        { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (text) => new Date(text).toLocaleString(), sorter: true, showSorterTooltip: false },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys) => setSelectedRowKeys(keys),
    };

    const renderToolbar = () => {
        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <Input.Search placeholder="搜索版本号或物料编码" onSearch={handleSearch} style={{ width: 300 }} allowClear />
                    {selectedRowKeys.length > 0 && <Typography.Text strong>已选择 {selectedRowKeys.length} 项</Typography.Text>}
                </Space>
                {selectedRowKeys.length > 0 && (
                    <Space>
                        <Button icon={<EditOutlined />} disabled={selectedRowKeys.length !== 1} onClick={() => showModal(versions.find(v => v.id === selectedRowKeys[0]))}>编辑</Button>
                        <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 个版本吗?`} onConfirm={handleBatchDelete}>
                            <Button danger icon={<DeleteOutlined />}>删除</Button>
                        </Popconfirm>
                    </Space>
                )}
            </div>
        );
    };

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                {renderToolbar()}
            </div>
            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={versions}
                    rowKey="id"
                    loading={loading && versions.length === 0}
                    pagination={false}
                    onChange={handleTableChange}
                    rowSelection={rowSelection}
                    onRow={(record) => ({ onClick: () => {
                            const keys = selectedRowKeys.includes(record.id) ? selectedRowKeys.filter(k => k !== record.id) : [record.id];
                            setSelectedRowKeys(keys);
                        }})}
                    sticky
                    footer={() => (
                        <>
                            {loading && versions.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && versions.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>
            <Modal title="编辑BOM版本" open={isModalVisible} onOk={handleOk} onCancel={() => setIsModalVisible(false)} destroyOnClose>
                <Form form={form} layout="vertical">
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                    <Form.Item name="is_active" label="设为激活版本" valuePropName="checked"><Switch /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default VersionList;