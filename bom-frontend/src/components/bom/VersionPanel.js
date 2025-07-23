import React from 'react';
import { Button, List, Popconfirm, message, Tag, Space, Card } from 'antd';
import { PlusOutlined, EditOutlined, CheckCircleOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../api';

// 简化的 VersionPanel，不再管理内部状态和数据请求
const VersionPanel = ({
                          versions,
                          loading,
                          material,
                          selectedVersion,
                          onVersionSelect,
                          onAddVersion,
                          onEditVersion,
                          onCopyVersion,
                          onDeleteVersion,
                          onActivateVersion, // 新增一个激活版本的处理器
                      }) => {

    const handleActivate = async (e, version) => {
        e.stopPropagation();
        if (version.is_active) return;
        try {
            await api.put(`/versions/${version.id}`, { is_active: true, remark: version.remark, material_id: version.material_id });
            message.success(`${version.version_code} 已激活`);
            onActivateVersion(); // 调用父组件传入的回调函数来刷新列表
        } catch (error) {
            message.error('激活失败');
        }
    };

    return (
        <Card
            title="BOM 版本"
            extra={<Button onClick={onAddVersion} type="primary" size="small" icon={<PlusOutlined />}>新增版本</Button>}
            // --- 核心修改 #1: 移除宽度和高度限制，只保留 flex-shrink ---
            style={{ flexShrink: 0 }}
            // --- 核心修改 #2: 为Card的body设置最大高度和滚动条 ---
            bodyStyle={{
                padding: '0 1px',
                maxHeight: '240px', // 您可以根据需要调整这个高度
                overflowY: 'auto'
            }}
        >
            <List
                loading={loading}
                dataSource={versions}
                renderItem={item => (
                    <List.Item
                        actions={[
                            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={(e) => handleActivate(e, item)} disabled={item.is_active}>激活</Button>,
                            <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); onEditVersion(item); }}>编辑</Button>,
                            <Button type="link" size="small" icon={<CopyOutlined />} onClick={(e) => { e.stopPropagation(); onCopyVersion(item); }}>复制</Button>,
                            <Popconfirm
                                title="确定将此版本移至回收站吗?"
                                onConfirm={(e) => { e.stopPropagation(); onDeleteVersion(item.id); }}
                                onCancel={(e) => e.stopPropagation()}
                                okText="是"
                                cancelText="否"
                            >
                                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()}>删除</Button>
                            </Popconfirm>
                        ]}
                        style={{ cursor: 'pointer', padding: '8px 16px', backgroundColor: selectedVersion?.id === item.id ? '#e6f7ff' : 'transparent' }}
                        onClick={() => onVersionSelect(item)}
                    >
                        <List.Item.Meta
                            title={<Space>{item.version_code} {item.is_active && <Tag color="green">当前激活</Tag>}</Space>}
                            description={item.remark || '无备注'}
                        />
                    </List.Item>
                )}
            />
        </Card>
    );
};

export default VersionPanel;