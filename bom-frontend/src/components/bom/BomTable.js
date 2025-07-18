// src/components/bom/BomTable.js (已修复)
import React from 'react';
import { Table, Typography, Popover } from 'antd'; // 引入 Popover

const { Text } = Typography;

const BomTable = ({ loading, bomLines, selectedLineKeys, onSelectionChange, expandedRowKeys, onExpandedRowsChange }) => {

    // --- 核心修改：在这里添加了 "工艺说明" 和 "备注" 两列 ---
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
            // 使用 Popover 悬浮显示完整内容
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
                rowKey="id"
                loading={loading}
                pagination={false}
                size="small"
                rowSelection={lineRowSelection}
                sticky
                onRow={(record) => ({
                    onClick: (event) => {
                        if (event.target.className?.includes('ant-table-row-expand-icon')) return;
                        if (window.getSelection().toString()) return;
                        onSelectionChange([record.id]);
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