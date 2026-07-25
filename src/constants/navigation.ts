// 左侧导航配置。
//
// 项目最终会包含《需求文档》第十二节列出的 18 个页面，
// 但本仓库按"六个阶段"逐步实现（见 README 的实现进度说明）。
// 这里只登记当前阶段已经真正实现、可以跳转的页面，
// 避免出现指向空壳页面的死链接。后续阶段会持续往这个数组追加。
export interface NavItem {
  path: string
  label: string
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '首页' },
  { path: '/cluster', label: '虚拟集群' },
  { path: '/terminal', label: 'kubectl 终端' },
  { path: '/yaml-lab', label: 'YAML 实验室' },
  { path: '/designer', label: '拖拽式架构设计器' },
]
