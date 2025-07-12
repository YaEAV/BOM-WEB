// src/components/WhereUsedModal.js (最终体验优化版)
import React, { useState, useEffect, useCallback } from 'react';
import { Modal, List, message, Spin, Empty, Button, Typography, Breadcrumb, Tag } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import api from '../api';

const { Text, Link } = Typography;

const WhereUsedModal = ({ visible, onCancel, material, onJumpToBom }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [history, setHistory] = useState([]);

    const currentMaterial = history.length > 0 ? history[history.length - 1] : null;

    useEffect(() => {
        if (visible && material) {
            setHistory([material]);
        }
    }, [visible, material]);

    useEffect(() => {
        if (!visible) {
            setHistory([]);
            setData([]);
        }
    }, [visible]);

    const fetchWhereUsed = useCallback((mat) => {
        if (!mat || !mat.id) {
            setData([]);
            return;
        }

        setLoading(true);
        api.get(`/materials/${mat.id}/where-used`)
            .then(response => {
                setData(response.data);
            })
            .catch(() => {
                message.error('获取使用情况失败');
                setData([]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        fetchWhereUsed(currentMaterial);
    }, [currentMaterial, fetchWhereUsed]);

    const handleDrillUp = (parentMaterial) => {
        const nextMaterialId = parentMaterial.parent_material_id;
        if (currentMaterial && currentMaterial.id === nextMaterialId) {
            message.info('已到达此路径的顶端。');
            return;
        }
        setHistory(prev => [...prev, {
            id: nextMaterialId,
            name: parentMaterial.parent_name,
            material_code: parentMaterial.parent_material_code,
        }]);
    };

    const handleBreadcrumbClick = (index) => {
        // --- 优化点2：如果点击的已经是最后一项，则不执行任何操作 ---
        if (index === history.length - 1) {
            return;
        }
        setHistory(prev => prev.slice(0, index + 1));
    };

    const breadcrumbItems = history.map((mat, index) => {
        const isLast = index === history.length - 1;
        const title = <><Text strong>{mat.material_code}</Text> - {mat.name}</>;

        // --- 优化点1：为当前项增加视觉高亮 ---
        if (isLast) {
            return { title: <span style={{ color: '#1890ff' }}>{title}</span> };
        }
        return {
            title: <Link onClick={() => handleBreadcrumbClick(index)}>{title}</Link>
        };
    });

    const modalTitle = (
        <div>
            物料反查
            {history.length > 0 && <Breadcrumb separator=">" style={{ marginTop: 8 }} items={breadcrumbItems} />}
        </div>
    );

    return (
        <Modal
            title={modalTitle}
            open={visible}
            onCancel={onCancel}
            footer={[ <Button key="back" onClick={onCancel}>关闭</Button> ]}
            width={900}
            destroyOnClose
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <Spin tip="正在查询..." />
                </div>
            ) : data.length > 0 ? (
                <List
                    style={{ maxHeight: '60vh', overflow: 'auto' }}
                    dataSource={data}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button type="link" icon={<SwapOutlined />} onClick={() => handleDrillUp(item)}>
                                    继续反查
                                </Button>,
                                <Button type="link" onClick={() => onJumpToBom(item.parent_material_id, item.version_id)}>
                                    查看BOM
                                </Button>
                            ]}
                        >
                            <List.Item.Meta
                                title={<><Text strong>{item.parent_material_code}</Text> - {item.parent_name}</>}
                                description={<>在BOM版本 <Text strong>{item.version_code}</Text> 中使用{item.is_active ? <Tag color="green" style={{marginLeft: 8}}>已激活</Tag> : ''}</>}
                            />
                        </List.Item>
                    )}
                />
            ) : (
                <Empty description={
                    // --- 优化点3：提供更明确的提示信息 ---
                    history.length <= 1
                        ? "此物料是一个顶层物料或未在任何BOM中使用。"
                        : "已追溯至顶层，此父项未被其他BOM使用。"
                } />
            )}
        </Modal>
    );
};

export default WhereUsedModal;