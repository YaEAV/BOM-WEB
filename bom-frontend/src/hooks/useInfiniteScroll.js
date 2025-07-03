import { useState, useCallback, useRef, useEffect } from 'react';

export const useInfiniteScroll = (fetchFunction, initialParams = {}) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [params, setParams] = useState(initialParams);

    const fetchFunctionRef = useRef(fetchFunction);
    useEffect(() => {
        fetchFunctionRef.current = fetchFunction;
    }, [fetchFunction]);

    const fetchData = useCallback(async (pageToFetch, searchParams, isNewSearch) => {
        if (loading && !isNewSearch) return;
        setLoading(true);
        try {
            const response = await fetchFunctionRef.current({
                page: pageToFetch,
                limit: 50,
                ...searchParams
            });
            const { data: newData, hasMore: newHasMore } = response.data;

            setData(prev => isNewSearch ? newData : [...prev, ...newData.filter(item => !prev.find(p => p.id === item.id))]);
            setHasMore(newHasMore);
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) {
            // 当捕获到任何错误时，我们设置 hasMore 为 false。
            // 这会立即停止无限滚动的触发条件 (hasMore && !loading)。
            setHasMore(false);
            console.error('API call failed in useInfiniteScroll, stopping further requests:', error);
        } finally {
            setLoading(false);
        }
    }, [loading]); // 这里的依赖是正确的，因为其他变量在 useCallback 内部没有被直接使用

    useEffect(() => {
        // research 或 params 变化时，重新从第一页加载
        fetchData(1, params, true);
    }, [params]); // 移除 fetchData 依赖，防止不必要的重渲染循环

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 150 && hasMore && !loading) {
            fetchData(page, params, false);
        }
    };

    const research = (newParams) => {
        setPage(1);
        setData([]);
        // 在新的搜索开始时，必须重置 hasMore 为 true。
        setHasMore(true);
        setParams(prev => ({ ...prev, ...newParams }));
    };

    const refresh = () => {
        setPage(1);
        setData([]);
        setHasMore(true);
        fetchData(1, params, true);
    };

    const updateItemInData = (itemId, updatedValues) => {
        setData(prevData => prevData.map(item =>
            item.id === itemId ? { ...item, ...updatedValues } : item
        ));
    };

    return {
        data,
        loading,
        hasMore,
        handleScroll,
        research,
        refresh,
        setData,
        updateItemInData
    };
};