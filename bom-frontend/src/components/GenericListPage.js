// src/components/GenericListPage.js (已修复)
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
                             refreshKey,
                             onRowClick,
                         }) => {
    const { message } = AntApp.useApp();
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);
    const [sorter, setSorter] = useState(initialSorter || { field: columns[0].dataIndex, order: 'ascend' });
    const [isSelectAll, setIsSelectAll] = useState(false);

    const getListData = useCallback((params) => {
        const extraParams = getExtraParams();
        return service.get({ ...params, ...extraParams });
    }, [service, getExtraParams]);

    const { data, loading, hasMore, handleScroll, research, refresh, search } = useInfiniteScroll(
        getListData,
        { sortBy: sorter.field, sortOrder: sorter.order === 'descend' ? 'desc' : 'asc' }
    );
    useEffect(() => {
        if (refreshKey > 0) {
            refresh();
        }
    }, [refreshKey, refresh]);


    const handleSearch = (value) => {
        setIsSelectAll(false);
        setSelectedRowKeys([]);
        setSelectedRows([]);
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
            setSelectedRowKeys([]);
            setSelectedRows([]);
            setIsSelectAll(false);
            refresh();
        } catch (error) {
            // Error handled by global interceptor
        }
    };

    const rowSelection = useMemo(() => {
        const handleSelectAllDB = async () => {
            if (!service.getAllIds) {
                message.error('此列表不支持选择全部功能。');
                return;
            }
            try {
                // --- 核心修改：将 getExtraParams() 的结果传递给 getAllIds ---
                const extraParams = getExtraParams();
                const response = await service.getAllIds({ search: search, ...extraParams });
                const allIds = response.data;
                setSelectedRowKeys(allIds);
                setIsSelectAll(true);
                message.success(`已跨页选择全部 ${allIds.length} 项数据。`);
            } catch (e) {
                message.error('获取全部数据ID失败');
            }
        };

        return {
            selectedRowKeys,
            onChange: (keys, rows) => {
                setSelectedRowKeys(keys);
                setSelectedRows(rows);
                setIsSelectAll(false);
            },
            selections: [
                Table.SELECTION_ALL,
                Table.SELECTION_INVERT,
                Table.SELECTION_NONE,
                {
                    key: 'selectAllFromDB',
                    text: '选择所有数据',
                    onSelect: () => handleSelectAllDB(),
                },
            ],
        };
    }, [selectedRowKeys, service, getExtraParams, search]);

    const memoizedToolbarButtons = useMemo(() => toolbarButtonsConfig(isSelectAll ? selectedRowKeys.map(id => ({id})) : selectedRows, refresh, handleAction), [selectedRows, selectedRowKeys, isSelectAll, toolbarButtonsConfig, refresh, handleAction]);
    const memoizedMoreMenuItems = useMemo(() => moreMenuItemsConfig(isSelectAll ? selectedRowKeys.map(id => ({id})) : selectedRows, refresh, handleAction), [selectedRows, selectedRowKeys, isSelectAll, moreMenuItemsConfig, refresh, handleAction]);

    const memoizedColumns = useMemo(() => {
        return columns.map(col => ({
            ...col,
            ellipsis: col.ellipsis !== false,
            render: col.render || ((text) => text ? <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> : null),
        }));
    }, [columns]);

    const dataSource = getExtraParams().includeDeleted
        ? data.filter(item => item.deleted_at)
        : data;

    return (
        <div style={{ height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
            <ListPageToolbar
                searchPlaceholder={searchPlaceholder}
                onSearch={handleSearch}
                selectedCount={selectedRowKeys.length}
                buttons={memoizedToolbarButtons}
                moreMenuItems={memoizedMoreMenuItems}
            />
            <div onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    rowKey="id"
                    columns={memoizedColumns}
                    dataSource={dataSource}
                    rowSelection={rowSelection}
                    pagination={false}
                    sticky
                    size="small"
                    loading={loading && data.length === 0}
                    onChange={handleTableChange}
                    onRow={(record) => ({
                        onClick: () => {
                            if (window.getSelection().toString()) return;
                            if (onRowClick) {
                                onRowClick(record);
                            } else {
                                setSelectedRowKeys([record.id]);
                                setSelectedRows([record]);
                                setIsSelectAll(false);
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