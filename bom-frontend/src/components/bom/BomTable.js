// src/components/bom/BomTable.js (已修复)
import React from 'react';
import { Table, Typography, Popover } from 'antd';

const { Text } = Typography;

const BomTable = ({ loading, bomLines, selectedLineKeys, onSelectionChange, expandedRowKeys, onExpandedRowsChange }) => {

    const bomLineColumns = [
        { title: '层级', dataIndex: 'level', key: 'level', width: 80 },
        { title: '位置编号', dataIndex: 'display_position_code', key: 'display_position_code', width: 120 },
        { title: '子件编码', dataIndex: 'component_code', key: 'component_code', width: 150 },
        { title: '子件名称', dataIndex: 'component_name', key: 'component_name', ellipsis: true },
        { title: '规格', dataIndex: 'component_spec', key: 'component_spec', ellipsis: true },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: '单位', dataIndex: 'component_unit', key: 'component_unit', width: 80 },
        {
            title: '工艺说明',
            dataIndex: 'process_info',
            key: 'process_info',
            ellipsis: true,
            render: (text) => text ? <Popover content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> : null,
        },
        {
            title: '备注',
            dataIndex: 'remark',
            key: 'remark',
            ellipsis: true,
            render: (text) => text ? <Popover content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> : null,
        },
    ];

    const lineRowSelection = {
        selectedRowKeys: selectedLineKeys,
        onChange: onSelectionChange,
    };

    return (
        <div style={{ flex: 1, overflow: 'auto' }}>
            <Table
                columns={bomLineColumns}
                dataSource={bomLines}
                rowKey="key" // <-- 核心修改 #1: 使用 "key" 作为唯一标识
                loading={loading}
                pagination={false}
                size="small"
                rowSelection={lineRowSelection}
                sticky
                onRow={(record) => ({
                    onClick: (event) => {
                        if (event.target.className?.includes('ant-table-row-expand-icon')) return;
                        if (window.getSelection().toString()) return;
                        onSelectionChange([record.key]); // <-- 核心修改 #2: 传递 record.key
                    },
                })}
                indentSize={10}
                expandedRowKeys={expandedRowKeys}
                onExpandedRowsChange={onExpandedRowsChange}
            />
        </div>
    );
};

export default BomTable;