// src/components/bom/BomTable.js
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
        // 核心修改:
        // 1. 将根元素设置为一个flex容器，它将占据所有可用高度。
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            <Table
                rowKey="key"
                columns={bomLineColumns}
                dataSource={bomLines}
                rowSelection={rowSelection}
                loading={loading}
                pagination={false}

                // 2. 让表格组件在flex容器中自动伸展以填充剩余空间。
                style={{ flex: 1, overflow: 'hidden' }}
                // 3. 将表格内容区域的高度设置为100%，Ant Design会自动处理表头的高度。
                scroll={{ y: '100%' }}

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
                scroll={{ x: 1500, y: 'calc(100vh - 280px)' }}
            />
        </div>
    );
};

export default BomTable;