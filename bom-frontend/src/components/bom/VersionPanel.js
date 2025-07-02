// src/components/bom/VersionPanel.js (新文件)

import React, { useState, useEffect, useCallback } from 'react';
import { Button, List, Popconfirm, message, Tag, Space, Card } from 'antd';
import { PlusOutlined, EditOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../../api';

const VersionPanel = ({ material, selectedVersion, onVersionSelect, onEditVersion, onAddVersion, onVersionsLoaded }) => {
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchVersions = useCallback(async (materialId) => {
        if (!materialId) return;
        setLoading(true);
        try {
            const response = await api.get(`/versions/material/${materialId}`);
            setVersions(response.data);
            onVersionsLoaded(response.data); // 将加载到的版本数据传回给父组件
        } catch (error) {
            message.error('加载BOM版本失败');
        } finally {
            setLoading(false);
        }
    }, [onVersionsLoaded]);

    useEffect(() => {
        fetchVersions(material?.id);
    }, [material, fetchVersions]);

    const handleActivateVersion = async (version) => {
        if (version.is_active) return;
        try {
            await api.put(`/versions/${version.id}`, { is_active: true, remark: version.remark, material_id: version.material_id });
            message.success(`${version.version_code} 已激活`);
            fetchVersions(material.id);
        } catch (error) {
            message.error('激活失败');
        }
    };

    const handleVersionDelete = async (versionId) => {
        try {
            await api.delete(`/versions/${versionId}`);
            message.success('BOM版本删除成功');
            fetchVersions(material.id);
        } catch (error) {
            message.error(error.response?.data?.error || '删除失败');
        }
    };

    return (
        <Card
            title="BOM 版本"
            extra={<Button onClick={onAddVersion} type="primary" size="small" icon={<PlusOutlined />}>新增版本</Button>}
            style={{ flexShrink: 0 }}
            bodyStyle={{ padding: '0 1px' }}
        >
            <div style={{ maxHeight: '30vh', overflow: 'auto' }}>
                <List
                    loading={loading}
                    dataSource={versions}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleActivateVersion(item)} disabled={item.is_active}>激活</Button>,
                                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEditVersion(item)}>编辑</Button>,
                                <Popconfirm title="确定删除此版本吗?" onConfirm={() => handleVersionDelete(item.id)}><Button type="link" size="small" danger>删除</Button></Popconfirm>
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