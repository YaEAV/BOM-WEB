// src/pages/DrawingManagerDrawer.js (已修复)

import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, Collapse, Space, Popconfirm, message, Typography, Upload, Modal, Form, Input, List, Empty, Tag, Spin } from 'antd';
import { UploadOutlined, PlusOutlined, DownloadOutlined, DeleteOutlined, PaperClipOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../api';
import _ from 'lodash';

const { Panel } = Collapse;
const { Text } = Typography;

const DrawingUploadModal = ({ visible, onCancel, onOk, materialId }) => {
    const [form] = Form.useForm();
    const [uploading, setUploading] = useState(false);
    const [fileList, setFileList] = useState([]);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (fileList.length === 0) {
                message.error('请至少选择一个图纸文件！');
                return;
            }

            setUploading(true);
            const formData = new FormData();
            formData.append('version', values.version);
            formData.append('description', values.description || '');
            fileList.forEach(file => {
                formData.append('drawingFiles', file.originFileObj || file);
            });

            // 修复：显式设置 Content-Type 为 multipart/form-data，
            // axios 会自动处理 boundary
            await api.post(`/materials/${materialId}/drawings`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            message.success(`${fileList.length} 个图纸上传成功！`);
            setUploading(false);
            onOk();
        } catch (error) {
            setUploading(false);
            message.error(error.response?.data?.error || '上传失败，请检查版本号与文件名组合是否唯一。');
        }
    };

    const handleCancelModal = () => {
        form.resetFields();
        setFileList([]);
        onCancel();
    };

    const uploadProps = {
        onRemove: file => {
            const index = fileList.indexOf(file);
            const newFileList = fileList.slice();
            newFileList.splice(index, 1);
            setFileList(newFileList);
        },
        beforeUpload: (file) => {
            setFileList(prev => [...prev, file]);
            return false;
        },
        fileList,
        multiple: true,
    };

    return (
        <Modal
            title="上传新批次图纸"
            open={visible}
            onCancel={handleCancelModal}
            onOk={handleOk}
            confirmLoading={uploading}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={handleOk}>
                <Form.Item name="version" label="图纸版本/批次号" rules={[{ required: true, message: '请输入版本号' }]}>
                    <Input placeholder="例如: V1.0、2025-06-30-A" />
                </Form.Item>
                <Form.Item name="description" label="版本描述">
                    <Input.TextArea placeholder="说明此批次图纸的变更内容" />
                </Form.Item>
                <Form.Item label="图纸文件 (可多选)" required>
                    <Upload {...uploadProps}>
                        <Button icon={<UploadOutlined />}>选择文件</Button>
                    </Upload>
                </Form.Item>
            </Form>
        </Modal>
    );
};

const DrawingManagerDrawer = ({ visible, onClose, material }) => {
    const [drawingsByVersion, setDrawingsByVersion] = useState({});
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);

    const fetchDrawings = useCallback(async () => {
        if (!material) return;
        setLoading(true);
        try {
            const response = await api.get(`/materials/${material.id}/drawings`);
            const groupedData = _.groupBy(response.data, 'version');
            setDrawingsByVersion(groupedData);
        } catch (error) {
            message.error('加载图纸列表失败');
        } finally {
            setLoading(false);
        }
    }, [material]);

    useEffect(() => {
        if (visible) {
            fetchDrawings();
        }
    }, [visible, fetchDrawings]);

    const handleActivate = async (drawingId, version) => {
        try {
            const optimisticData = { ...drawingsByVersion };
            optimisticData[version] = optimisticData[version].map(d => ({...d, is_active: d.id === drawingId }));
            setDrawingsByVersion(optimisticData);

            await api.put(`/drawings/${drawingId}/activate`);
            message.success('激活成功');
            fetchDrawings();
        } catch (error) {
            message.error('操作失败，正在恢复');
            fetchDrawings();
        }
    };

    const handleDelete = async (drawingId) => {
        try {
            await api.delete(`/drawings/${drawingId}`);
            message.success('删除成功');
            fetchDrawings();
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleDownload = (drawingId) => {
        window.open(`${api.defaults.baseURL}/drawings/${drawingId}`);
    };

    const handleModalSuccess = () => {
        setIsModalVisible(false);
        fetchDrawings();
    };

    return (
        <>
            <Drawer
                title={<>图纸管理: <Text strong>{material?.name}</Text></>}
                width={600}
                onClose={onClose}
                open={visible}
                destroyOnClose
            >
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setIsModalVisible(true)}
                    style={{ marginBottom: 16 }}
                >
                    上传新批次
                </Button>
                {loading ? (
                    <div style={{textAlign: 'center', padding: 24}}><Spin/></div>
                ) : Object.keys(drawingsByVersion).length > 0 ? (
                    <Collapse accordion>
                        {Object.entries(drawingsByVersion).map(([version, files]) => (
                            <Panel
                                header={
                                    <Space>
                                        <Text strong>{`版本/批次: ${version}`}</Text>
                                        {files.some(f => f.is_active) && <Tag color="green">当前激活</Tag>}
                                    </Space>
                                }
                                key={version}
                            >
                                <List
                                    dataSource={files}
                                    renderItem={item => (
                                        <List.Item actions={[
                                            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleActivate(item.id, item.version)} disabled={item.is_active}>设为激活</Button>,
                                            <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(item.id)}>下载</Button>,
                                            <Popconfirm title="确定删除此文件吗?" onConfirm={() => handleDelete(item.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>,
                                        ]}>
                                            <List.Item.Meta avatar={<PaperClipOutlined />} title={item.file_name.replace(`${version}-`, '')} />
                                        </List.Item>
                                    )}
                                />
                            </Panel>
                        ))}
                    </Collapse>
                ) : (
                    <Empty description="暂无图纸文件，请上传新批次。" />
                )}
            </Drawer>
            {isModalVisible && (
                <DrawingUploadModal
                    visible={isModalVisible}
                    onCancel={() => setIsModalVisible(false)}
                    onOk={handleModalSuccess}
                    materialId={material.id}
                />
            )}
        </>
    );
};

export default DrawingManagerDrawer;