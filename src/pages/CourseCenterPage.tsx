import { Link } from 'react-router-dom'
import { COURSES } from '@/data/courses/courses'
import { useProgressStore } from '@/stores/useProgressStore'

/**
 * 课程中心：列出全部课程（对应需求文档第八节"教学模式"），
 * 显示每节课的完成状态，点击进入课程详情页。
 */
export function CourseCenterPage() {
  const completedCourseIds = useProgressStore((state) => state.completedCourseIds)
  const completedCount = completedCourseIds.length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">课程中心</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          共 {COURSES.length} 节中文课程，已完成 {completedCount} 节。每节课包含概念讲解、
          架构图、命令示例、YAML 示例、知识检查，部分课程还支持在虚拟集群中直接操作校验。
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {COURSES.map((course) => {
          const completed = completedCourseIds.includes(course.id)
          return (
            <li key={course.id}>
              <Link
                to={`/courses/${course.id}`}
                className={`block rounded-md border p-3 hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  completed
                    ? 'border-emerald-300 dark:border-emerald-700'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                  <span>第 {course.index} 课</span>
                  {completed && (
                    <span className="text-emerald-600 dark:text-emerald-400">已完成</span>
                  )}
                </div>
                <div className="mt-1 font-medium">{course.title}</div>
                {!course.verification && (
                  <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    讲解型课程（暂不支持在虚拟集群中直接校验）
                  </div>
                )}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
