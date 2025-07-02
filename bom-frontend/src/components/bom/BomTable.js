// src/components/bom/BomTable.js (新文件)

import React from 'react';
import { Table, Typography } from 'antd';

const { Text } = Typography;

const BomTable = ({ loading, bomLines, selectedLineKeys, onSelectionChange }) => {

    const bomLineColumns = [
        { title: '层级', dataIndex: 'level', key: 'level', width: 80 },
        { title: '位置编号', dataIndex: 'display_position_code', key: 'display_position_code', width: 120 },
        { title: '子件编码', dataIndex: 'component_code', key: 'component_code', width: 150 },
        { title: '子件名称', dataIndex: 'component_name', key: 'component_name', ellipsis: true },
        { title: '规格', dataIndex: 'component_spec', key: 'component_spec', ellipsis: true },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: '单位', dataIndex: 'component_unit', key: 'component_unit', width: 80 },
    ];

    const lineRowSelection = {
        selectedRowKeys: selectedLineKeys, // Use the prop that was passed in.
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
                        // 防止展开/折叠图标的点击触发选择
                        if (event.target.className?.includes('ant-table-row-expand-icon')) return;
                        if (window.getSelection().toString()) return; // 防止文本选择触发
                        onSelectionChange([record.id]);
                    },
                })}
            />
        </div>
    );
};

export default BomTable;