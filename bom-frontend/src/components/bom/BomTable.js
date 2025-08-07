// src/components/bom/BomTable.js (最终修复版：移除scroll，由父容器处理滚动)
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

    const rowSelection = {
        selectedRowKeys: selectedLineKeys,
        onChange: onSelectionChange,
        checkStrictly: true,
    };

    return (
        // 这个 div 将会负责滚动
        // 它的父容器(在BomManagerDrawer.js中)已经设置了 flex:1 和 overflow:hidden
        // 这使得这个div的高度是自适应的，不多也不少
        <div style={{ height: '100%', overflow: 'auto' }}>
            <Table
                rowKey="key"
                columns={bomLineColumns}
                dataSource={bomLines}
                rowSelection={rowSelection}
                loading={loading}
                pagination={false}
                // --- 核心修改：完全移除 scroll 属性 ---
                // 让表格的高度由内容撑开，滚动由父容器处理
                expandedRowKeys={expandedRowKeys}
                onExpandedRowsChange={onExpandedRowsChange}
                size="small"
                onRow={(record) => ({
                    onClick: (event) => {
                        if (event.target.closest('.ant-popover-inner-content')) {
                            return;
                        }
                        const newSelectedKeys = selectedLineKeys.includes(record.key) ? [] : [record.key];
                        onSelectionChange(newSelectedKeys);
                    },
                })}
                indentSize={5}
            />
        </div>
    );
};

export default BomTable;