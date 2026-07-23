# API 设计

统一前缀 `/api/v1`。成功返回 `{success,data,requestId}`；失败返回 `{success:false,error,requestId}`。分页使用 page/pageSize，最大 pageSize 100。Swagger 在 `/api/docs`。
