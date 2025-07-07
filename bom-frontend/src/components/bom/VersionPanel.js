// src/components/bom/VersionPanel.js (已恢复删除功能)

import React, { useState, useEffect, useCallback } from 'react';
import { Button, List, Popconfirm, message, Tag, Space, Card } from 'antd';
import { PlusOutlined, EditOutlined, CheckCircleOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../api';

// --- 核心修改：增加了 onVersionDelete prop ---
const VersionPanel = ({ material, selectedVersion, onVersionSelect, onEditVersion, onAddVersion, onCopyVersion, onVersionDelete, onVersionsLoaded }) => {
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchVersions = useCallback(async (materialId) => {
        if (!materialId) return;
        setLoading(true);
        try {
            const response = await api.get(`/versions/material/${materialId}`);
            setVersions(response.data);
            if(onVersionsLoaded) onVersionsLoaded(response.data);
        } catch (error) {
            message.error('加载BOM版本失败');
        } finally {
            setLoading(false);
        }
    }, [onVersionsLoaded]);

    useEffect(() => {
        // 当 material 或 reloader 变化时，重新获取版本列表
        fetchVersions(material?.id);
    }, [material, fetchVersions]);


    const handleActivateVersion = async (version) => {
        if (version.is_active) return;
        try {
            await api.put(`/versions/${version.id}`, { is_active: true, remark: version.remark, material_id: version.material_id });
            message.success(`${version.version_code} 已激活`);
            fetchVersions(material.id); // 重新加载版本以更新状态
        } catch (error) {
            message.error('激活失败');
        }
    };

    return (
        <Card
            title="BOM 版本"
            extra={<Button onClick={onAddVersion} type="primary" size="small" icon={<PlusOutlined />}>新增版本</Button>}
            style={{ flexShrink: 0 }}
            styles={{ body: { padding: '0 1px' } }}
        >
            <div style={{ maxHeight: '30vh', overflow: 'auto' }}>
                <List
                    loading={loading}
                    dataSource={versions}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={(e) => { e.stopPropagation(); handleActivateVersion(item); }} disabled={item.is_active}>激活</Button>,
                                <Button type="link" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); onEditVersion(item); }}>编辑</Button>,
                                <Button type="link" size="small" icon={<CopyOutlined />} onClick={(e) => { e.stopPropagation(); onCopyVersion(item); }}>复制</Button>,
                                // --- 核心修复：恢复了删除按钮和气泡确认框 ---
                                <Popconfirm
                                    title="确定删除此版本吗?"
                                    onConfirm={(e) => { e.stopPropagation(); onVersionDelete(item.id); }}
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
            </div>
        </Card>
    );
};

export default VersionPanel;