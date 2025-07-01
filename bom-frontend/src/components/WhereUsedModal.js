// src/components/WhereUsedModal.js (已修正)
import React, { useState, useEffect } from 'react';
import { Modal, Table, message, Spin, Empty, Tag, Button } from 'antd'; // 修正：在这里导入 Button
import api from '../api';

const WhereUsedModal = ({ visible, onCancel, material, onJumpToBom }) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);

    useEffect(() => {
        if (visible && material?.id) {
            setLoading(true);
            api.get(`/materials/${material.id}/where-used`)
                .then(response => {
                    setData(response.data);
                })
                .catch(() => {
                    message.error('获取使用情况失败');
                })
                .finally(() => {
                    setLoading(false);
                });
        }
    }, [visible, material]);

    const columns = [
        {
            title: '上级物料编码',
            dataIndex: 'parent_material_code',
            key: 'parent_material_code',
        },
        {
            title: '上级物料名称',
            dataIndex: 'parent_name',
            key: 'parent_name',
        },
        {
            title: 'BOM版本号',
            dataIndex: 'version_code',
            key: 'version_code',
        },
        {
            title: '激活状态',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (isActive) => isActive ? <Tag color="green">已激活</Tag> : null,
        },
        {
            title: '操作',
            key: 'action',
            render: (_, record) => (
                <a onClick={() => onJumpToBom(record.parent_material_id, record.version_id)}>
                    查看BOM
                </a>
            ),
        },
    ];

    return (
        <Modal
            title={`物料反查: ${material?.name} (${material?.material_code})`}
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="back" onClick={onCancel}>
                    关闭
                </Button>,
            ]}
            width={800}
            destroyOnClose
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <Spin />
                </div>
            ) : data.length > 0 ? (
                <Table
                    columns={columns}
                    dataSource={data}
                    rowKey="version_id"
                    pagination={false}
                    size="small"
                />
            ) : (
                <Empty description="此物料未在任何BOM版本中使用。" />
            )}
        </Modal>
    );
};

export default WhereUsedModal;