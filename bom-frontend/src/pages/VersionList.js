// src/pages/VersionList.js (已修正)
import React, { useState, useReducer, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Switch, Tag, Spin, Typography } from 'antd';
import { AppstoreOutlined, DeleteOutlined } from '@ant-design/icons';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { versionService } from '../services/versionService';
import { materialService } from '../services/materialService';
import BomManagerDrawer from './BomManagerDrawer';

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

    const [bomDrawerState, setBomDrawerState] = useState({
        visible: false,
        material: null,
        versionId: null,
    });

    const {
        data: versions,
        loading,
        hasMore,
        handleScroll,
        research,
        refresh,
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

    const handleShowBom = async (version) => {
        if (!version) return;
        try {
            message.loading({ content: '正在加载物料信息...', key: 'loadingMaterial' });
            const res = await materialService.getMaterialById(version.material_id);
            message.success({ content: '加载成功!', key: 'loadingMaterial', duration: 2 });
            setBomDrawerState({ visible: true, material: res.data, versionId: version.id });
        } catch (error) {
            message.error({ content: '加载物料信息失败!', key: 'loadingMaterial', duration: 2 });
        }
    };

    const handleBatchDelete = async () => {
        try {
            await versionService.deleteVersions(selectedRowKeys);
            message.success(`成功删除 ${selectedRowKeys.length} 个版本`);
            setSelectedRowKeys([]);
            refresh();
        } catch (error) {
            console.error('批量删除失败:', error);
        }
    };

    // --- 关键修改：恢复被删除的列定义 ---
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
                    <Button
                        icon={<AppstoreOutlined />}
                        disabled={selectedRowKeys.length !== 1}
                        onClick={() => handleShowBom(versions.find(v => v.id === selectedRowKeys[0]))}
                    >
                        查看BOM
                    </Button>
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

            {bomDrawerState.visible && (
                <BomManagerDrawer
                    visible={bomDrawerState.visible}
                    onClose={() => setBomDrawerState({ visible: false, material: null, versionId: null })}
                    material={bomDrawerState.material}
                    initialVersionId={bomDrawerState.versionId}
                />
            )}
        </div>
    );
};

export default VersionList;