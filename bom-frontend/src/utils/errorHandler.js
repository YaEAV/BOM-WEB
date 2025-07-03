import { message } from 'antd';

/**
 * 一个统一的API错误消息显示函数
 * @param {Error} error - 从axios的catch块中捕获的错误对象
 * @param {string} [defaultMessage='操作失败'] - 当无法解析出具体错误时显示的默认消息
 */
export const showApiErrorMessage = (error, defaultMessage = '操作失败') => {
    const errorData = error.response?.data;
    let errorMessage = defaultMessage;

    if (errorData?.error) {
        // 兼容 {"error": "这是一个错误字符串"}
        if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
        }
        // 兼容 {"error": {"message": "这是一个带有消息的错误对象"}}
        else if (errorData.error.message && typeof errorData.error.message === 'string') {
            errorMessage = errorData.error.message;
        }
    } else if (typeof errorData?.message === 'string') {
        // 兼容某些代理或网关可能返回的格式 {"message": "..."}
        errorMessage = errorData.message;
    }

    message.error(errorMessage);
};