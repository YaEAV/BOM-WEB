import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Button, List, Space, Popconfirm, message, Typography, Divider, Table, Modal, Upload } from 'antd';
import { PlusOutlined, DownloadOutlined, UploadOutlined, EditOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../api';
import VersionModal from '../components/VersionModal';
import BomLineModal from '../components/BomLineModal';

const { Title, Text } = Typography;

const BomImportModal = ({ visible, onCancel, onOk, versionId }) => {
    const [uploading, setUploading] = useState(false);
    const uploadProps = {
        name: 'file',
        action: `${window.location.protocol}//${window.location.hostname}:52026/api/lines/import/${versionId}`,
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') {
                setUploading(true);
                return;
            }
            setUploading(false);
            if (info.file.status === 'done') {
                message.success(info.file.response.message || 'BOM导入成功！');
                onOk();
            } else if (info.file.status === 'error') {
                message.error(info.file.response?.error || 'BOM导入失败。');
            }
        },
    };
    return (
        <Modal
            title="导入BOM结构"
            open={visible}
            onCancel={onCancel}
            footer={[<Button key="back" onClick={onCancel}>关闭</Button>]}
            destroyOnClose
        >
            <p><strong>重要：</strong>本次导入将会<strong>覆盖</strong>当前版本的所有BOM行。</p>
            <p>请上传格式与模板一致的Excel文件。</p>
            <br />
            <a href={`${window.location.protocol}//${window.location.hostname}:52026/api/lines/template`} download>下载导入模板</a>
            <br />
            <br />
            <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />} style={{ width: '100%' }} loading={uploading}>
                    {uploading ? '正在上传并处理...' : '点击选择文件并开始导入'}
                </Button>
            </Upload>
        </Modal>
    );
};

const BomManagerDrawer = ({ visible, onClose, material }) => {
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [bomLines, setBomLines] = useState([]);
    const [loadingLines, setLoadingLines] = useState(false);
    const [isLineModalVisible, setIsLineModalVisible] = useState(false);
    const [editingLine, setEditingLine] = useState(null);
    const [lineModalContext, setLineModalContext] = useState({ versionId: null, parentId: null });
    const [isVersionModalVisible, setIsVersionModalVisible] = useState(false);
    const [versionTarget, setVersionTarget] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [editingVersion, setEditingVersion] = useState(null);

    const fetchVersionsAndSetState = useCallback(async (materialId, selectVersionId = null) => {
        setLoadingVersions(true);
        try {
            const response = await api.get(`/versions/material/${materialId}`);
            const fetchedVersions = response.data;
            setVersions(fetchedVersions);
            let versionToSelect = null;
            if (selectVersionId) {
                versionToSelect = fetchedVersions.find(v => v.id === selectVersionId);
            }
            if (!versionToSelect) {
                versionToSelect = fetchedVersions.find(v => v.is_active) || fetchedVersions[0] || null;
            }
            setSelectedVersion(versionToSelect);
        } catch (error) {
            message.error('加载BOM版本失败');
            setVersions([]);
            setSelectedVersion(null);
        } finally {
            setLoadingVersions(false);
        }
    }, []);

    useEffect(() => {
        if (visible && material) {
            setBomLines([]);
            fetchVersionsAndSetState(material.id);
        }
    }, [visible, material, fetchVersionsAndSetState]);

    const fetchBomLines = useCallback(async () => {
        if (!selectedVersion) {
            setBomLines([]);
            return;
        }
        setLoadingLines(true);
        try {
            const response = await api.get(`/lines/version/${selectedVersion.id}`);
            setBomLines(response.data);
        } catch (error) {
            message.error('加载BOM清单失败');
            setBomLines([]);
        } finally {
            setLoadingLines(false);
        }
    }, [selectedVersion]);

    useEffect(() => {
        fetchBomLines();
    }, [fetchBomLines]);

    const handleVersionModalOk = async (values, versionToEdit) => {
        try {
            let newVersionId = null;
            if (versionToEdit) {
                // 编辑逻辑
                await api.put(`/versions/${versionToEdit.id}`, {
                    remark: values.remark,
                    is_active: values.is_active,
                    material_id: versionToEdit.material_id, // 后端需要此ID来正确更新其他版本的激活状态
                });
                message.success('版本更新成功');
                newVersionId = versionToEdit.id;
            } else {
                // 新增逻辑
                const target = versionTarget;
                if (!target) return;
                const fullVersionCode = `${target.material_code || target.component_code}_V${values.version_suffix}`;
                const response = await api.post('/versions', {
                    material_id: target.id || target.component_id,
                    version_code: fullVersionCode,
                    remark: values.remark || '',
                    is_active: true, // 新增时默认激活
                });
                message.success('新版本创建成功');
                newVersionId = response.data.id;
            }
            setIsVersionModalVisible(false);
            setEditingVersion(null);
            setVersionTarget(null);
            await fetchVersionsAndSetState(material.id, newVersionId);
        } catch (error) {
            message.error(error.response?.data?.error || '操作失败');
        }
    };

    const handleActivateVersion = async (version) => {
        if (version.is_active) return;
        try {
            await api.put(`/versions/${version.id}`, {
                is_active: true,
                remark: version.remark,
                material_id: version.material_id
            });
            message.success(`${version.version_code} 已激活`);
            await fetchVersionsAndSetState(material.id, version.id);
        } catch (error) {
            message.error('激活失败');
        }
    };

    const openVersionModal = (version = null) => {
        setEditingVersion(version);
        setVersionTarget(material); // 总是以当前抽屉的物料为目标
        setIsVersionModalVisible(true);
    };

    const handleVersionDelete = async (versionId) => {
        try {
            await api.delete(`/versions/${versionId}`);
            message.success('BOM版本删除成功');
            // 重新加载版本，并自动选择激活的或第一个
            await fetchVersionsAndSetState(material.id);
        } catch (error) {
            message.error(error.response?.data?.error || '删除失败');
        }
    };

    const handleOpenLineModal = (line = null, parentId = null) => {
        setEditingLine(line);
        setLineModalContext({
            versionId: selectedVersion?.id,
            parentId: parentId || line?.parent_line_id
        });
        setIsLineModalVisible(true);
    };

    const handleLineModalOk = async (values, lineId) => {
        try {
            if (lineId) {
                await api.put(`/lines/${lineId}`, values);
                message.success('BOM行更新成功');
            } else {
                await api.post('/lines', values);
                message.success('BOM行新增成功');
            }
            setIsLineModalVisible(false);
            fetchBomLines();
        } catch (error) { message.error(error.response?.data?.error || '操作失败'); }
    };

    const handleLineDelete = async (lineId) => {
        try {
            await api.delete(`/lines/${lineId}`);
            message.success('BOM行删除成功');
            fetchBomLines();
        } catch (error) { message.error(error.response?.data?.error || '删除失败'); }
    };

    const handleAddSubItem = (record) => {
        // 子件已有激活的BOM版本，直接为该版本添加根物料
        if (record.component_active_version_id) {
            handleOpenLineModal(null, record.id, record.component_active_version_id);
        } else {
            // 子件没有BOM版本，提示用户先为子件创建一个
            setVersionTarget({
                id: record.component_id,
                material_code: record.component_code,
                name: record.component_name
            });
            setIsVersionModalVisible(true);
        }
    };

    const handleExportExcel = () => {
        if (!selectedVersion) return;
        setExporting(true);
        window.open(`${window.location.protocol}//${window.location.hostname}:52026/api/lines/export/${selectedVersion.id}`);
        setExporting(false);
    };

    const handleImportOk = () => {
        setIsImportModalVisible(false);
        fetchBomLines();
    };

    const bomLineColumns = [
        { title: '层级', dataIndex: 'level', key: 'level', width: 80 },
        { title: '位置编号', dataIndex: 'display_position_code', key: 'display_position_code', width: 120 },
        { title: '子件编码', dataIndex: 'component_code', key: 'component_code', width: 150 },
        { title: '子件名称', dataIndex: 'component_name', key: 'component_name' },
        { title: '规格', dataIndex: 'component_spec', key: 'component_spec' },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: '单位', dataIndex: 'component_unit', key: 'component_unit', width: 80 },
        {
            title: '操作', key: 'action', fixed: 'right', width: 180,
            render: (_, record) => (
                <Space size="small">
                    <Button type="link" size="small" onClick={() => handleOpenLineModal(record)}>编辑</Button>
                    <Popconfirm title="确定删除此行吗?" onConfirm={() => handleLineDelete(record.id)}>
                        <Button type="link" size="small" danger>删除</Button>
                    </Popconfirm>
                    <Button type="link" size="small" onClick={() => handleAddSubItem(record)}>添加子项</Button>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Drawer
                title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>}
                width={'70%'}
                onClose={onClose}
                open={visible}
                destroyOnClose // 确保抽屉关闭时销毁所有状态
            >
                <Title level={5}>BOM 版本</Title>
                <Button onClick={() => openVersionModal()} type="primary" size="small" icon={<PlusOutlined />} style={{ marginBottom: 16 }}>新增版本</Button>
                <List
                    loading={loadingVersions}
                    dataSource={versions}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleActivateVersion(item)} disabled={item.is_active}>激活</Button>,
                                <Button type="link" icon={<EditOutlined />} onClick={() => openVersionModal(item)}>编辑</Button>,
                                <Popconfirm title="确定删除此版本吗?" onConfirm={() => handleVersionDelete(item.id)}><Button type="link" danger>删除</Button></Popconfirm>
                            ]}
                            style={{ cursor: 'pointer', padding: '8px 16px', backgroundColor: selectedVersion?.id === item.id ? '#e6f7ff' : 'transparent' }}
                            onClick={() => setSelectedVersion(item)}
                        >
                            <List.Item.Meta title={<Space>{item.version_code} {item.is_active && <Text type="success">(当前激活)</Text>}</Space>} description={item.remark || '无备注'} />
                        </List.Item>
                    )}
                />
                <Divider />
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Title level={5} style={{ margin: 0 }}>BOM 结构 (版本: {selectedVersion?.version_code || 'N/A'})</Title>
                    <Space>
                        <Button onClick={() => setIsImportModalVisible(true)} icon={<UploadOutlined />} disabled={!selectedVersion}>导入BOM</Button>
                        <Button onClick={handleExportExcel} icon={<DownloadOutlined />} disabled={!selectedVersion || bomLines.length === 0 || exporting} loading={exporting}>导出Excel</Button>
                        <Button onClick={() => handleOpenLineModal(null, null)} type="primary" icon={<PlusOutlined />} disabled={!selectedVersion}>添加根物料</Button>
                    </Space>
                </Space>
                <Table
                    columns={bomLineColumns}
                    dataSource={bomLines}
                    loading={loadingLines}
                    rowKey="id"
                    pagination={false}
                    size="small"
                />
            </Drawer>

            <VersionModal
                visible={isVersionModalVisible}
                onCancel={() => { setIsVersionModalVisible(false); setEditingVersion(null); setVersionTarget(null); }}
                onOk={handleVersionModalOk}
                targetMaterial={versionTarget}
                editingVersion={editingVersion}
            />
            {isLineModalVisible && (
                <BomLineModal
                    visible={isLineModalVisible}
                    onCancel={() => setIsLineModalVisible(false)}
                    onOk={handleLineModalOk}
                    editingLine={editingLine}
                    versionId={lineModalContext.versionId}
                    parentId={lineModalContext.parentId}
                />
            )}
            {selectedVersion && (
                <BomImportModal
                    visible={isImportModalVisible}
                    onCancel={() => setIsImportModalVisible(false)}
                    onOk={handleImportOk}
                    versionId={selectedVersion.id}
                />
            )}
        </>
    );
};

export default BomManagerDrawer;