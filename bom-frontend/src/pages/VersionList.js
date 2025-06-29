import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Switch, Tag, Spin } from 'antd';
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
    const [sorter, setSorter] = useState({ field: 'version_code', order: 'ascend' });
    // --- MODIFICATION START ---
    // 1. 添加多选状态
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    // --- MODIFICATION END ---

    const fetchVersions = useCallback(async (pageToFetch, searchValue, newSearchOrSort, currentSorter) => {
        // --- MODIFICATION START ---
        // 3. 修复无限加载问题：在加载时直接返回，避免重复触发
        if (loading) return;
        // --- MODIFICATION END ---
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

            // --- MODIFICATION START ---
            // 3. 修复无限加载问题：确保新数据不重复
            setVersions(prev => {
                const currentData = newSearchOrSort ? [] : prev;
                const existingIds = new Set(currentData.map(item => item.id));
                const newItems = data.filter(item => !existingIds.has(item.id));
                return [...currentData, ...newItems];
            });
            // --- MODIFICATION END ---

            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) {
            message.error('加载BOM版本列表失败');
        } finally {
            setLoading(false);
        }
    }, [loading]); // 移除 sorter, page, currentSearch 依赖，避免不必要的重渲染

    useEffect(() => {
        fetchVersions(1, currentSearch, true, sorter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sorter]); // 仅在排序变化时重新触发

    useEffect(() => {
        // 初始化加载
        fetchVersions(1, '', true, sorter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearch = (value) => {
        setCurrentSearch(value);
        setPage(1);
        setHasMore(true);
        fetchVersions(1, value, true, sorter);
    };

    const handleTableChange = (pagination, filters, newSorter) => {
        if (newSorter.field !== sorter.field || newSorter.order !== sorter.order) {
            const newSorterState = {
                field: newSorter.field || 'version_code',
                order: newSorter.order || 'ascend'
            };
            setSorter(newSorterState);
            setPage(1);
            setHasMore(true);
        }
    };

    const handleScroll = (event) => {
        const target = event.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = target;
        if (scrollHeight - scrollTop <= clientHeight + 100) {
            if (hasMore && !loading) {
                fetchVersions(page, currentSearch, false, sorter);
            }
        }
    };

    const showModal = (version = null) => {
        setEditingVersion(version);
        if (version) {
            form.setFieldsValue({
                remark: version.remark,
                is_active: version.is_active
            });
        }
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingVersion(null);
        form.resetFields();
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingVersion) {
                await api.put(`/versions/${editingVersion.id}`, {
                    ...values,
                    material_id: editingVersion.material_id
                });
                message.success('版本更新成功');
                handleCancel();
                fetchVersions(1, currentSearch, true, sorter);
            }
        } catch (errorInfo) {
            message.error('更新失败');
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/versions/${id}`);
            message.success('版本删除成功');
            fetchVersions(1, currentSearch, true, sorter);
        } catch (error) {
            message.error('删除失败，请检查BOM是否被使用');
        }
    };

    const handleSelectAllVersions = async () => {
        try {
            setLoading(true);
            const response = await api.get('/versions/all-ids', {
                params: { search: currentSearch }
            });
            setSelectedRowKeys(response.data);
            message.success(`已选中全部 ${response.data.length} 个版本。`);
        } catch (error) {
            message.error('获取全部版本ID失败');
        } finally {
            setLoading(false);
        }
    };

    const handleBatchDelete = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请至少选择一个版本进行删除。');
            return;
        }
        try {
            await api.post('/versions/delete', { ids: selectedRowKeys });
            message.success('批量删除成功');
            setSelectedRowKeys([]);
            // 刷新列表
            fetchVersions(1, currentSearch, true, sorter);
        } catch (error) {
            message.error(error.response?.data?.error || '批量删除失败');
        }
    };

    const columns = [
        { title: '版本号', dataIndex: 'version_code', key: 'version_code', sorter: true },
        { title: '所属物料编码', dataIndex: 'material_code', key: 'material_code', sorter: true },
        { title: '所属物料名称', dataIndex: 'material_name', key: 'material_name' },
        { title: '是否激活', dataIndex: 'is_active', key: 'is_active', render: (isActive) => (isActive ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>) },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
        { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (text) => new Date(text).toLocaleString(), sorter: true },
        {
            title: '操作',
            key: 'action',
            className: 'ant-table-cell-ops', //  <-- 添加这一行
            render: (_, record) => (
                <Space size="middle">
                    <a onClick={() => showModal(record)}>编辑</a>
                    <Popconfirm title="确定要删除此版本吗?" onConfirm={() => handleDelete(record.id)}><a>删除</a></Popconfirm>
                </Space>
            )
        },
    ];

    // --- MODIFICATION START ---
    // 1. 定义 rowSelection
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
                    handleSelectAllVersions();
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
    // --- MODIFICATION END ---

    return (
        <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ paddingBottom: 16 }}>
                <Space>
                    <Input.Search
                        placeholder="搜索版本号或物料编码"
                        onSearch={handleSearch}
                        style={{ width: 300 }}
                        allowClear
                    />
                    <Popconfirm
                        title={`确定要删除选中的 ${selectedRowKeys.length} 个版本吗?`}
                        onConfirm={handleBatchDelete}
                        disabled={selectedRowKeys.length === 0}
                    >
                        <Button danger disabled={selectedRowKeys.length === 0}>
                            批量删除
                        </Button>
                    </Popconfirm>
                </Space>
            </div>
            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    columns={columns}
                    dataSource={versions}
                    rowKey="id"
                    loading={loading && versions.length === 0}
                    pagination={false}
                    onChange={handleTableChange}
                    sticky
                    // --- MODIFICATION START ---
                    // 1. 应用 rowSelection 和 onRow
                    rowSelection={rowSelection}
                    onRow={(record) => ({
                        onClick: (event) => {
                            // 检查点击的不是复选框或删除按钮等操作元素
                            if (event.target.closest('.ant-table-selection-column, .ant-table-cell-ops')) {
                                return;
                            }
                            setSelectedRowKeys([record.id]);
                        },
                    })}
                    // --- MODIFICATION END ---
                    footer={() => (
                        <>
                            {loading && versions.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && versions.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>

            <Modal
                title="编辑BOM版本"
                open={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="remark" label="备注">
                        <Input.TextArea />
                    </Form.Item>
                    <Form.Item name="is_active" label="是否激活" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default VersionList;