import axios from 'axios';

// 标志位，确保拦截器只被附加一次
let interceptorAttached = false;

const getBaseUrl = () => {
    if (process.env.NODE_ENV === 'development') {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = 52026;
        return `${protocol}//${hostname}:${port}/api`;
    }
    return '/api';
};

const apiClient = axios.create({
    baseURL: getBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * 设置全局API响应拦截器。
 * @param {object} staticFunction - 从 antd App 组件中获取的静态方法实例，如 message, notification, modal。
 */
export const setupInterceptors = (staticFunction) => {
    // 如果拦截器已经附加过，则直接返回，防止重复注册
    if (interceptorAttached) {
        return;
    }

    apiClient.interceptors.response.use(
        (response) => response, // 对成功的响应不做处理
        (error) => {
            // 使用从 App 组件传来的 messageApi 实例来显示错误
            const { message: messageApi } = staticFunction;

            if (error.response && messageApi) {
                const errorData = error.response.data;
                let errorMessage = '发生未知错误';

                if (errorData?.error?.message) {
                    errorMessage = errorData.error.message;
                } else if (typeof errorData?.error === 'string') {
                    errorMessage = errorData.error;
                } else if (typeof errorData?.message === 'string') {
                    errorMessage = errorData.message;
                }

                messageApi.error(errorMessage);
            } else if (error.request && messageApi) {
                messageApi.error('网络错误，请检查您的连接');
            }

            // 必须将错误继续抛出，以便组件内的catch块可以执行后续逻辑（如停止加载状态）
            return Promise.reject(error);
        }
    );

    // 设置标志位为 true，表示拦截器已成功设置
    interceptorAttached = true;
};

export default apiClient;