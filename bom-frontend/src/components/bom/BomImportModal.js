// src/components/bom/BomImportModal.js (已修改)
import React, { useState } from 'react';
import { Modal, Button, Upload, App as AntApp, Radio, Space,  Form, List, Typography } from 'antd'; // 增加了 Radio, Space, List, Typography
import { UploadOutlined } from '@ant-design/icons';
import api from '../../api';

const { Text } = Typography;

const BomImportModal = ({ visible, onCancel, onOk, versionId }) => {
    const { message: messageApi, modal: modalApi } = AntApp.useApp();
    const [uploading, setUploading] = useState(false);
    const [importMode, setImportMode] = useState('overwrite'); // 增加导入模式的状态

    const uploadProps = {
        name: 'file',
        // --- 关键修改：将导入模式作为查询参数添加到URL ---
        action: `${api.defaults.baseURL}/lines/import/${versionId}?mode=${importMode}`,
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
                if (errorData?.error?.errors && Array.isArray(errorData.error.errors)) {
                    modalApi.error({
                        title: 'BOM导入失败，文件中存在以下错误：',
                        width: 600,
                        content: (
                            <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '16px' }}>
                                <List
                                    dataSource={errorData.error.errors}
                                    renderItem={item => (
                                        <List.Item>
                                            <Text type="danger">{`第 ${item.row} 行: ${item.message}`}</Text>
                                        </List.Item>
                                    )}
                                />
                            </div>
                        ),
                        // 该模态框需要用户手动点击“确定”按钮关闭
                    });
                } else {
                    // 对于单个或未知格式的错误，保持原有的 message 提示
                    const errorMessage = errorData?.error?.message || errorData?.error || 'BOM导入失败';
                    messageApi.error(errorMessage);
                }
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
            <p>请下载模板，并确保上传的文件格式与模板一致。</p>
            <p><strong>说明：</strong>仅当一个子件本身也作为父项（即拥有自己的BOM）时，才需要在其对应的行中填写“BOM版本”列的后缀。</p>

            <a href={`${api.defaults.baseURL}/lines/template`} download>下载导入模板</a>
            <br /><br />

            {/* --- 关键修改：增加导入模式选择 --- */}
            <Form.Item label="导入模式">
                <Radio.Group onChange={(e) => setImportMode(e.target.value)} value={importMode}>
                    <Radio value="overwrite"><strong>覆盖导入</strong> (清空现有BOM，然后导入文件中的所有行)</Radio>
                    <Radio value="incremental"><strong>增量导入</strong> (添加新行，更新已有行，不删除任何行)</Radio>
                </Radio.Group>
            </Form.Item>

            <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />} style={{ width: '100%' }} loading={uploading}>
                    {uploading ? '正在上传并处理...' : '点击选择文件并开始导入'}
                </Button>
            </Upload>
        </Modal>
    );
};

export default BomImportModal;