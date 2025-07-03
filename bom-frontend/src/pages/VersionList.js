// src/pages/VersionList.js (已修正)
import React, { useState, useReducer } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Switch, Tag, Spin, Typography } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { versionService } from '../services/versionService';

const initialState = {
    isModalVisible: false,
    editingVersion: null,
};

function modalReducer(state, action) {
    switch (action.type) {
        case 'SHOW_MODAL':
            return { isModalVisible: true, editingVersion: action.payload };
        case 'HIDE_MODAL':
            return { isModalVisible: false, editingVersion: null };
        default:
            return state;
    }
}

const VersionList = () => {
    const [modalState, dispatch] = useReducer(modalReducer, initialState);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [sorter, setSorter] = useState({ field: 'created_at', order: 'descend' });
    const [form] = Form.useForm();

    const {
        data: versions,
        loading,
        hasMore,
        handleScroll,
        research,
        refresh,
        updateItemInData,
    } = useInfiniteScroll(versionService.getVersions, {
        sortBy: sorter.field,
        sortOrder: sorter.order === 'descend' ? 'desc' : 'asc',
    });

    const handleSearch = (value) => {
        research({ search: value });
    };

    const handleTableChange = (pagination, filters, newSorter) => {
        const newSorterState = { field: newSorter.field || 'created_at', order: newSorter.order || 'descend' };
        if (newSorterState.field !== sorter.field || newSorterState.order !== sorter.order) {
            setSorter(newSorterState);
            research({ sortBy: newSorterState.field, sortOrder: newSorterState.order === 'descend' ? 'desc' : 'asc' });
        }
    };

    const showModal = (version) => {
        form.setFieldsValue({ remark: version.remark, is_active: version.is_active });
        dispatch({ type: 'SHOW_MODAL', payload: version });
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            const { editingVersion } = modalState;
            if (editingVersion) {
                await versionService.updateVersion(editingVersion.id, { ...values, material_id: editingVersion.material_id });
                message.success('版本更新成功');
                dispatch({ type: 'HIDE_MODAL' });
                updateItemInData(editingVersion.id, values);
            }
        } catch (error) {
            // 错误提示已由全局拦截器处理
            console.error('版本更新失败:', error);
        }
    };

    const handleBatchDelete = async () => {
        try {
            await versionService.deleteVersions(selectedRowKeys);
            message.success(`成功删除 ${selectedRowKeys.length} 个版本`);
            setSelectedRowKeys([]);
            refresh();
        } catch (error) {
            // 错误提示已由全局拦截器处理
            console.error('批量删除失败:', error);
        }
    };

    const columns = [
        { title: '版本号', dataIndex: 'version_code', key: 'version_code', sorter: true, showSorterTooltip: false },
        { title: '所属物料编码', dataIndex: 'material_code', key: 'material_code', sorter: true, showSorterTooltip: false },
        { title: '所属物料名称', dataIndex: 'material_name', key: 'material_name', ellipsis: true },
        { title: '激活状态', dataIndex: 'is_active', key: 'is_active', render: (isActive) => isActive ? <Tag color="green">已激活</Tag> : <Tag>未激活</Tag> },
        { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
        { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (text) => new Date(text).toLocaleString(), sorter: true, showSorterTooltip: false },
    ];

    const renderToolbar = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
                <Input.Search placeholder="搜索版本号或物料编码" onSearch={handleSearch} style={{ width: 300 }} allowClear />
                {selectedRowKeys.length > 0 && <Typography.Text strong>已选择 {selectedRowKeys.length} 项</Typography.Text>}
            </Space>
            {selectedRowKeys.length > 0 && (
                <Space>
                    <Button icon={<EditOutlined />} disabled={selectedRowKeys.length !== 1} onClick={() => showModal(versions.find(v => v.id === selectedRowKeys[0]))}>编辑</Button>
                    <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 个版本及其BOM行吗?`} onConfirm={handleBatchDelete}>
                        <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )}
        </div>
    );

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
                    rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                    onRow={(record) => ({
                        onClick: () => {
                            if (window.getSelection().toString()) return;
                            setSelectedRowKeys([record.id]);
                        }
                    })}
                    sticky
                    size="small"
                    footer={() => (
                        <>
                            {loading && versions.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && versions.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>
            <Modal title="编辑BOM版本" open={modalState.isModalVisible} onOk={handleOk} onCancel={() => dispatch({ type: 'HIDE_MODAL' })} destroyOnHidden>
                <Form form={form} layout="vertical">
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                    <Form.Item name="is_active" label="设为激活版本" valuePropName="checked"><Switch /></Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default VersionList;