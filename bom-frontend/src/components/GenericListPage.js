// src/components/GenericListPage.js (已修复回收站过滤问题)
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { App as AntApp, Table, Spin, Popover, Typography } from 'antd';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import ListPageToolbar from './ListPageToolbar';

const { Text } = Typography;

const GenericListPage = ({
                             service,
                             columns,
                             searchPlaceholder,
                             initialSorter,
                             getExtraParams = () => ({}),
                             toolbarButtonsConfig,
                             moreMenuItemsConfig,
                             onRowClick,
                             refreshKey,
                         }) => {
    const { message } = AntApp.useApp();
    const [selectedRows, setSelectedRows] = useState([]);
    const [sorter, setSorter] = useState(initialSorter || { field: columns[0].dataIndex, order: 'ascend' });

    // VVVV --- 核心修正：使用 useCallback 来记忆 getListData 函数 --- VVVV
    const getListData = useCallback((params) => {
        // 确保每次调用时都合并最新的额外参数
        const extraParams = getExtraParams();
        return service.get({ ...params, ...extraParams });
    }, [service, getExtraParams]);
    // ^^^^ --- 修正结束 --- ^^^^

    const { data, loading, hasMore, handleScroll, research, refresh } = useInfiniteScroll(
        getListData,
        { sortBy: sorter.field, sortOrder: sorter.order === 'descend' ? 'desc' : 'asc' }
    );

    useEffect(() => {
        if (refreshKey > 0) {
            refresh();
        }
    }, [refreshKey, refresh]);

    const handleSearch = (value) => {
        research({ search: value });
    };

    const handleTableChange = (pagination, filters, newSorter) => {
        const newSorterState = { field: newSorter.field || initialSorter.field, order: newSorter.order || 'ascend' };
        if (newSorterState.field !== sorter.field || newSorterState.order !== sorter.order) {
            setSorter(newSorterState);
            research({ sortBy: newSorterState.field, sortOrder: newSorterState.order === 'descend' ? 'desc' : 'asc' });
        }
    };

    const handleAction = async (actionFn, successMsg) => {
        try {
            await actionFn();
            if(successMsg) message.success(successMsg);
            setSelectedRows([]);
            refresh();
        } catch (error) {
            // 全局拦截器已处理错误消息，这里无需额外操作
            // 可以保留 console.error 用于调试
            console.error("An error occurred during the action:", error);
        }
    };

    const memoizedToolbarButtons = useMemo(() => toolbarButtonsConfig(selectedRows, refresh, handleAction), [selectedRows, toolbarButtonsConfig, refresh, handleAction]);
    const memoizedMoreMenuItems = useMemo(() => moreMenuItemsConfig(selectedRows, refresh, handleAction), [selectedRows, moreMenuItemsConfig, refresh, handleAction]);

    const memoizedColumns = useMemo(() => {
        return columns.map(col => ({
            ...col,
            ellipsis: col.ellipsis !== false,
            render: col.render || ((text) => text ? <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> : null),
        }));
    }, [columns]);

    const rowSelection = {
        type: 'checkbox',
        selectedRowKeys: selectedRows.map(r => r.id),
        onChange: (selectedRowKeys, selectedItems) => {
            setSelectedRows(selectedItems);
        },
    };

    // VVVV --- 核心修正：从返回的数据中过滤，确保只显示已删除的 --- VVVV
    const dataSource = getExtraParams().includeDeleted
        ? data.filter(item => item.deleted_at)
        : data;

    return (
        <div style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
            <ListPageToolbar
                searchPlaceholder={searchPlaceholder}
                onSearch={handleSearch}
                selectedCount={selectedRows.length}
                buttons={memoizedToolbarButtons}
                moreMenuItems={memoizedMoreMenuItems}
            />
            <div onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    rowKey="id"
                    columns={memoizedColumns}
                    dataSource={dataSource} // 使用过滤后的数据源
                    rowSelection={rowSelection}
                    pagination={false}
                    sticky
                    size="small"
                    loading={loading && data.length === 0}
                    onChange={handleTableChange}
                    onRow={(record) => ({
                        onClick: () => {
                            if (!window.getSelection().toString()) {
                                onRowClick ? onRowClick(record) : setSelectedRows([record]);
                            }
                        }
                    })}
                    footer={() => (
                        <>
                            {loading && data.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && data.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>
        </div>
    );
};

export default GenericListPage;