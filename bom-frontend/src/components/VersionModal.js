// src/components/VersionModal.js (完全替换)
import React, { useEffect } from 'react';
import { Modal, Form, Input, Switch } from 'antd';

const VersionModal = ({ visible, onCancel, onOk, targetMaterial, editingVersion }) => {
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible) {
            if (editingVersion) {
                form.setFieldsValue({
                    version_suffix: editingVersion.version_code.split('_V').pop(),
                    remark: editingVersion.remark,
                    is_active: editingVersion.is_active,
                });
            } else {
                form.resetFields();
                form.setFieldsValue({ is_active: true });
            }
        }
    }, [visible, editingVersion, form]);

    const handleOk = () => {
        form.validateFields().then(values => onOk(values, editingVersion)).catch(info => console.log('Validate Failed:', info));
    };

    const materialCode = editingVersion?.material_code || targetMaterial?.material_code || targetMaterial?.component_code || '';
    const title = editingVersion ? `编辑BOM版本` : `为 ${materialCode} 新增BOM版本`;

    return (
        <Modal title={title} open={visible} onCancel={onCancel} onOk={handleOk} destroyOnClose>
            <Form form={form} layout="vertical">
                <Form.Item label="所属物料编码"><Input value={materialCode} disabled /></Form.Item>
                <Form.Item name="version_suffix" label="版本号后缀" rules={[{ required: true, message: '请输入版本号后缀, 例如: 1.0' }]} help="最终版本号将是: 物料编码_V(后缀)">
                    <Input placeholder="例如: 1.0" disabled={!!editingVersion} />
                </Form.Item>
                <Form.Item name="remark" label="备注"><Input.TextArea rows={4} /></Form.Item>
                <Form.Item name="is_active" label="设为激活版本" valuePropName="checked"><Switch /></Form.Item>
            </Form>
        </Modal>
    );
};

export default VersionModal;