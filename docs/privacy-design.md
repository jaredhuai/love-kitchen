# 隐私设计

隔离边界是 kitchenId。任何资源读取均采用 `findFirst({where:{id,kitchenId,deletedAt:null}})` 形态；创建时 kitchenId 来自 Guard 上下文。预览邀请仅暴露厨房名称、头像、邀请人昵称和有效状态。未解锁情书列表不包含密文或正文。
