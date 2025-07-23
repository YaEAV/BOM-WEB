// src/components/bom/BomTable.js (已恢复原始交互)
import React from 'react';
import { Table, Popover, Typography } from 'antd';

const { Text } = Typography;

const BomTable = ({
                      loading,
                      bomLines,
                      selectedLineKeys,
                      onSelectionChange,
                      expandedRowKeys,
                      onExpandedRowsChange,
                  }) => {
    // 【采用您提供的原始列定义】
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
            render: (text) => text ? <Popover placement="topLeft" content={<Text style={{ maxWidth: 400, display: 'block' }} copyable>{text}</Text>}><span>{text}</span></Popover> : null,
        },
        {
            title: '备注',
            dataIndex: 'remark',
            key: 'remark',
            ellipsis: true,
            render: (text) => text ? <Popover placement="topLeft" content={<Text style={{ maxWidth: 400, display: 'block' }} copyable>{text}</Text>}><span>{text}</span></Popover> : null,
        },
    ];

    // 【修改】恢复原始的复选框和单选行为
    const rowSelection = {
        selectedRowKeys: selectedLineKeys,
        onChange: onSelectionChange,
        // 设置为 true，确保父子节点的勾选状态不关联，恢复您原始的独立勾选功能
        checkStrictly: true,
    };

    return (
        <div style={{ flex: 1, overflow: 'auto' }}>
            <Table
                rowKey="key"
                columns={bomLineColumns}
                dataSource={bomLines}
                rowSelection={rowSelection}
                loading={loading}
                pagination={false}
                scroll={{ y: 'calc(100vh - 400px)' }}
                expandedRowKeys={expandedRowKeys}
                onExpandedRowsChange={onExpandedRowsChange}
                size="small"
                // 【新增】恢复单击行即可选中的功能
                onRow={(record) => ({
                    onClick: (event) => {
                        // 防止点击Popover等元素时也触发选中
                        if (event.target.closest('.ant-popover-inner-content')) {
                            return;
                        }
                        // 实现单击单选，再次单击取消
                        const newSelectedKeys = selectedLineKeys.includes(record.key) ? [] : [record.key];
                        onSelectionChange(newSelectedKeys);
                    },
                })}
            />
        </div>
    );
};

export default BomTable;