// src/components/VersionModal.js (已支持复制模式)
import React, { useEffect } from 'react';
import { Modal, Form, Input, Switch } from 'antd';

const VersionModal = ({ visible, onCancel, onOk, targetMaterial, editingVersion, isCopyMode = false }) => {
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible) {
            if (editingVersion && !isCopyMode) {
                // 编辑模式
                form.setFieldsValue({
                    version_suffix: editingVersion.version_code.split('_V').pop(),
                    remark: editingVersion.remark,
                    is_active: editingVersion.is_active,
                });
            } else if (editingVersion && isCopyMode) {
                // 复制模式
                form.setFieldsValue({
                    version_suffix: `${editingVersion.version_code.split('_V').pop()}_COPY`, // 建议一个新后缀
                    remark: editingVersion.remark,
                    is_active: false, // 复制的版本默认不激活
                });
            } else {
                // 新增模式
                form.resetFields();
                form.setFieldsValue({ is_active: true });
            }
        }
    }, [visible, editingVersion, isCopyMode, form]);

    const handleOk = () => {
        form.validateFields().then(values => {
            const finalValues = { ...values, is_active: values.is_active || false };
            onOk(finalValues, editingVersion);
        }).catch(info => console.log('Validate Failed:', info));
    };

    const materialCode = targetMaterial?.material_code || '';
    const materialName = targetMaterial?.name || '';

    let title = `为 ${materialName} (${materialCode}) 新增BOM版本`;
    if (isCopyMode) {
        title = `复制BOM版本: ${editingVersion?.version_code}`;
    } else if (editingVersion) {
        title = `编辑BOM版本`;
    }

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
                    {/* 在编辑模式下禁用后缀修改，但在复制模式下允许 */}
                    <Input placeholder="例如: 1.0" disabled={!!editingVersion && !isCopyMode} />
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