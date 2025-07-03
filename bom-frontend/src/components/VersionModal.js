// src/components/VersionModal.js (已修改)
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
                // 默认将新版本设为激活状态
                form.setFieldsValue({ is_active: true });
            }
        }
    }, [visible, editingVersion, form]);

    const handleOk = () => {
        form.validateFields().then(values => {
            // 确保 is_active 字段总是有值
            const finalValues = { ...values, is_active: values.is_active || false };
            onOk(finalValues, editingVersion);
        }).catch(info => console.log('Validate Failed:', info));
    };

    // **修改点: 统一从 targetMaterial 获取物料编码和名称**
    // 这样无论传入的是主物料还是子物料对象，都能正确显示
    const materialCode = targetMaterial?.material_code || '';
    const materialName = targetMaterial?.name || '';
    const title = editingVersion ? `编辑BOM版本` : `为 ${materialName} (${materialCode}) 新增BOM版本`;

    return (
        <Modal title={title} open={visible} onCancel={onCancel} onOk={handleOk} destroyOnClose>
            <Form form={form} layout="vertical">
                <Form.Item label="所属物料编码">
                    <Input value={materialCode} disabled />
                </Form.Item>
                <Form.Item
                    name="version_suffix"
                    label="版本号后缀"
                    rules={[{ required: true, message: '请输入版本号后缀, 例如: 1.0' }]}
                    help="最终版本号将是: 物料编码_V(后缀)"
                >
                    <Input placeholder="例如: 1.0" disabled={!!editingVersion} />
                </Form.Item>
                <Form.Item name="remark" label="备注">
                    <Input.TextArea rows={4} />
                </Form.Item>
                <Form.Item name="is_active" label="设为激活版本" valuePropName="checked">
                    <Switch />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default VersionModal;