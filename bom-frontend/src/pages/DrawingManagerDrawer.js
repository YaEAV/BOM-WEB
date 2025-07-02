// src/pages/DrawingManagerDrawer.js (已增加激活状态显示和切换)

import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, Collapse, Space, Popconfirm, message, Typography, Upload, Modal, Form, Input, List, Empty, Tag, Spin } from 'antd';
import { UploadOutlined, PlusOutlined, DownloadOutlined, DeleteOutlined, PaperClipOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../api';
import _ from 'lodash';

const { Panel } = Collapse;
const { Text, Link } = Typography;

const DrawingUploadModal = ({ visible, onCancel, onOk, materialId, existingVersion }) => {
    const [form] = Form.useForm();
    const [uploading, setUploading] = useState(false);
    const [fileList, setFileList] = useState([]);

    useEffect(() => {
        if (existingVersion) {
            form.setFieldsValue({ version: existingVersion });
        }
    }, [existingVersion, form]);

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
            await api.post(`/materials/${materialId}/drawings`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            message.success(`${fileList.length} 个图纸上传成功！`);
            setUploading(false);
            onOk();
        } catch (error) {
            setUploading(false);
            message.error(error.response?.data?.error || '上传失败。');
        }
    };

    const handleCancelModal = () => {
        form.resetFields();
        setFileList([]);
        onCancel();
    };

    return (
        <Modal
            title={existingVersion ? `向版本 ${existingVersion} 添加文件` : "上传新批次图纸"}
            open={visible}
            onCancel={handleCancelModal}
            onOk={handleOk}
            confirmLoading={uploading}
            destroyOnHidden // <--- 修改
        >
            <Form form={form} layout="vertical" onFinish={handleOk}>
                <Form.Item name="version" label="图纸版本/批次号" rules={[{ required: true, message: '请输入版本号' }]}>
                    <Input placeholder="例如: V1.0、2025-06-30" disabled={!!existingVersion} />
                </Form.Item>
                <Form.Item name="description" label="版本描述">
                    <Input.TextArea placeholder="说明此批次图纸的变更内容" />
                </Form.Item>
                <Form.Item label="图纸文件 (可多选)" required>
                    <Upload
                        beforeUpload={file => { setFileList(prev => [...prev, file]); return false; }}
                        onRemove={file => setFileList(prev => prev.filter(f => f.uid !== file.uid))}
                        fileList={fileList}
                        multiple
                    >
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
    const [modalInfo, setModalInfo] = useState({ visible: false, materialId: null, version: null });

    const fetchDrawings = useCallback(async () => {
        if (!material) return;
        setLoading(true);
        try {
            const response = await api.get(`/materials/${material.id}/drawings`);
            const groupedData = _.groupBy(response.data, 'version');
            setDrawingsByVersion(groupedData);
        } catch (error) { message.error('加载图纸列表失败');
        } finally { setLoading(false); }
    }, [material]);

    useEffect(() => {
        if (visible) fetchDrawings();
    }, [visible, fetchDrawings]);

    const handleDelete = async (drawingId) => {
        try {
            await api.delete(`/drawings/${drawingId}`);
            message.success('删除成功');
            fetchDrawings();
        } catch (error) { message.error('删除失败'); }
    };

    // **优化点 3: 实现手动激活版本的功能**
    const handleActivateVersion = async (version) => {
        try {
            await api.put('/drawings/activate/version', { materialId: material.id, version });
            message.success(`版本 ${version} 已激活`);
            fetchDrawings(); // 重新获取数据以更新界面
        } catch (error) {
            message.error('激活失败');
        }
    };

    const handleDownloadSingle = (drawingId) => {
        window.open(`${api.defaults.baseURL}/drawings/${drawingId}`);
    };

    const handleDownloadVersion = async (version) => {
        try {
            const response = await api.get('/drawings/download/version', {
                params: { materialId: material.id, version },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${material.material_code}_${version}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            message.error('下载失败');
        }
    };

    const openUploadModal = (version = null) => {
        setModalInfo({ visible: true, materialId: material.id, version: version });
    };

    return (
        <>
            <Drawer
                title={<>图纸管理: <Text strong>{material?.name}</Text></>}
                width={720}
                onClose={onClose}
                open={visible}
                destroyOnHidden
            >
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openUploadModal()} style={{ marginBottom: 16 }}>
                    上传新批次/版本
                </Button>
                {loading ? <div style={{textAlign: 'center', padding: 24}}><Spin/></div>
                    : Object.keys(drawingsByVersion).length > 0 ? (
                        <Collapse accordion>
                            {Object.entries(drawingsByVersion).map(([version, files]) => {
                                // **优化点 4: 判断当前版本是否为激活状态**
                                const isActive = files.some(f => f.is_active);
                                return (
                                    <Panel
                                        header={
                                            <Space>
                                                <Text strong>{`版本/批次: ${version}`}</Text>
                                                {isActive && <Tag color="green">当前激活</Tag>}
                                            </Space>
                                        }
                                        key={version}
                                        extra={
                                            <Space>
                                                <Button size="small" type="dashed" onClick={(e) => { e.stopPropagation(); openUploadModal(version); }}>添加文件</Button>
                                                <Button size="small" icon={<DownloadOutlined />} onClick={(e) => { e.stopPropagation(); handleDownloadVersion(version); }}>批量下载</Button>
                                                {!isActive && (
                                                    <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />} onClick={(e) => { e.stopPropagation(); handleActivateVersion(version); }}>设为激活</Button>
                                                )}
                                            </Space>
                                        }
                                    >
                                        <List
                                            dataSource={files}
                                            renderItem={item => (
                                                <List.Item actions={[
                                                    <Link onClick={() => handleDownloadSingle(item.id)}>下载</Link>,
                                                    <Popconfirm title="确定删除此文件吗?" onConfirm={() => handleDelete(item.id)}><Link type="danger">删除</Link></Popconfirm>,
                                                ]}>
                                                    <List.Item.Meta avatar={<PaperClipOutlined />} title={item.file_name} description={item.description} />
                                                </List.Item>
                                            )}
                                        />
                                    </Panel>
                                );
                            })}
                        </Collapse>
                    ) : (
                        <Empty description={
                            <span>
                暂无图纸文件.
                <br />
                您可以上传一个新批次的图纸作为 V1.0 版本.
            </span>
                        }>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => openUploadModal()}>
                                上传新批次/版本
                            </Button>
                        </Empty>
                    )}
            </Drawer>
            {modalInfo.visible && (
                <DrawingUploadModal
                    visible={modalInfo.visible}
                    onCancel={() => setModalInfo({ ...modalInfo, visible: false })}
                    onOk={() => { setModalInfo({ ...modalInfo, visible: false }); fetchDrawings(); }}
                    materialId={modalInfo.materialId}
                    existingVersion={modalInfo.version}
                />
            )}
        </>
    );
};

export default DrawingManagerDrawer;