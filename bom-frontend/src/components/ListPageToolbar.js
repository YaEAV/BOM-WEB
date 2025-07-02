// src/components/ListPageToolbar.js (已修正)
import React from 'react';
import { Input, Button, Space, Popconfirm, Dropdown, Typography } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

const { Text } = Typography;

const ListPageToolbar = ({
                             searchPlaceholder = '搜索...',
                             onSearch,
                             selectedCount = 0,
                             buttons = [],
                             moreMenuItems = [], // <--- 修改：接收 item 数组
                         }) => {
    return (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <Input.Search
                        placeholder={searchPlaceholder}
                        onSearch={onSearch}
                        style={{ width: 250 }}
                        allowClear
                    />
                    {selectedCount > 0 && <Text strong>已选择 {selectedCount} 项</Text>}
                </Space>
                <Space>
                    {buttons.map((btn, index) => {
                        if (btn.isConfirm) {
                            return (
                                <Popconfirm
                                    key={index}
                                    title={btn.confirmTitle}
                                    onConfirm={btn.onClick}
                                    disabled={btn.disabled}
                                >
                                    <Button
                                        danger={btn.danger}
                                        icon={btn.icon}
                                        disabled={btn.disabled}
                                    >
                                        {btn.text}
                                    </Button>
                                </Popconfirm>
                            );
                        }
                        return (
                            <Button
                                key={index}
                                type={btn.type}
                                icon={btn.icon}
                                onClick={btn.onClick}
                                disabled={btn.disabled}
                                danger={btn.danger}
                            >
                                {btn.text}
                            </Button>
                        );
                    })}
                    {/* // VVVV --- 修改：使用新的 menu 和 items API --- VVVV */}
                    {moreMenuItems.length > 0 && <Dropdown menu={{ items: moreMenuItems }}><Button icon={<MoreOutlined />}>更多</Button></Dropdown>}
                </Space>
            </div>
        </div>
    );
};

export default ListPageToolbar;