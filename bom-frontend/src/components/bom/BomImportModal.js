// src/components/bom/BomImportModal.js (已清理)
import React, { useState } from 'react';
import { Modal, Button, Upload, App as AntApp } from 'antd'; // 移除了 message, 增加了 AntApp
import { UploadOutlined } from '@ant-design/icons';
import api from '../../api';

const BomImportModal = ({ visible, onCancel, onOk, versionId }) => {
    const { message: messageApi } = AntApp.useApp();
    const [uploading, setUploading] = useState(false);

    const uploadProps = {
        name: 'file',
        action: `${api.defaults.baseURL}/lines/import/${versionId}`,
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') {
                setUploading(true);
                return;
            }
            setUploading(false);
            if (info.file.status === 'done') {
                messageApi.success(info.file.response.message || 'BOM导入成功！');
                onOk();
            } else if (info.file.status === 'error') {
                const errorData = info.file.response;
                let errorMessage = 'BOM导入失败';
                if (errorData?.error) {
                    errorMessage = errorData.error.message || errorData.error;
                }
                messageApi.error(errorMessage);
            }
        },
    };

    return (
        <Modal
            title="通过Excel导入BOM结构"
            open={visible}
            onCancel={onCancel}
            footer={[<Button key="back" onClick={onCancel}>关闭</Button>]}
            destroyOnHidden
        >
            <p><strong>重要：</strong>本次导入将会<strong>覆盖</strong>当前版本的所有BOM行。</p>
            <p>请下载模板，并确保上传的文件格式与模板一致。</p>
            <br />
            <a href={`${api.defaults.baseURL}/lines/template`} download>下载导入模板</a>
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

export default BomImportModal;