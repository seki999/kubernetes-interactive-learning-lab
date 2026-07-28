import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { COURSES } from '@/data/courses/courses'
import { useEtcdStore } from '@/kubernetes/api-server/store'
import { useProgressStore } from '@/stores/useProgressStore'
import { CourseDiagram } from '@/components/Course/CourseDiagram'

/**
 * 课程详情页：渲染课程的十个组成部分（学习目标/概念说明/架构图/操作步骤/
 * 命令示例/YAML 示例/交互实验/知识检查/常见错误/本课总结），对应需求文档
 * 第八节"每一课至少包含"的清单。
 *
 * "交互校验"是这里的核心机制：课程本身不猜测用户做了什么操作，只是在
 * 用户点击"验证"按钮时读取当前虚拟集群的真实状态来判断目标是否达成——
 * 无论用户是通过 kubectl 终端、YAML 编辑器还是拖拽设计器完成的操作，
 * 都能被正确识别，因为三者共享同一个虚拟 API Server。
 */
export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const course = useMemo(() => COURSES.find((item) => item.id === courseId), [courseId])

  if (!course) {
    return (
      <div className="text-sm text-slate-500 dark:text-slate-400">
        没有找到这节课，
        <Link to="/courses" className="text-sky-600 underline dark:text-sky-400">
          返回课程中心
        </Link>
      </div>
    )
  }

  // 用 key={course.id} 让切换课程时这个子组件整体重新挂载，
  // 这样知识检查的作答状态、验证提示自然重置为初始值，
  // 不需要在 effect 里手动 setState 来"重置"（那样会触发多余的级联渲染）。
  return <CourseDetailBody key={course.id} course={course} />
}

function CourseDetailBody({ course }: { course: (typeof COURSES)[number] }) {
  const resources = useEtcdStore((state) => state.resources)
  const completedCourseIds = useProgressStore((state) => state.completedCourseIds)
  const markCourseCompleted = useProgressStore((state) => state.markCourseCompleted)
  const recordQuizResult = useProgressStore((state) => state.recordQuizResult)
  const touchStudyDay = useProgressStore((state) => state.touchStudyDay)

  const [verifyMessage, setVerifyMessage] = useState<string | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)

  useEffect(() => {
    touchStudyDay()
  }, [touchStudyDay])

  const completed = completedCourseIds.includes(course.id)
  const currentIndex = COURSES.findIndex((item) => item.id === course.id)
  const nextCourse = COURSES[currentIndex + 1]

  function handleVerify() {
    if (!course?.verification) return
    const passed = course.verification.verify(Object.values(resources))
    if (passed) {
      markCourseCompleted(course.id)
      setVerifyMessage('验证通过！虚拟集群里的实际状态已经达成本课目标。')
    } else {
      setVerifyMessage('还没有达成目标，请对照上面的操作提示再检查一下。')
    }
  }

  function handleSubmitQuiz() {
    if (!course) return
    const correct = course.quiz.filter(
      (question, index) => quizAnswers[index] === question.correctIndex
    ).length
    recordQuizResult(course.id, { correct, total: course.quiz.length })
    setQuizSubmitted(true)
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <Link to="/courses" className="text-sm text-sky-600 underline dark:text-sky-400">
          ← 返回课程中心
        </Link>
        <h1 className="mt-2 text-xl font-bold">
          第 {course.index} 课：{course.title}
        </h1>
        {completed && (
          <span className="mt-1 inline-block text-sm text-emerald-600 dark:text-emerald-400">
            已完成
          </span>
        )}
      </div>

      <Section title="学习目标">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {course.objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </Section>

      <Section title="概念说明">
        <div className="space-y-3 text-sm leading-relaxed">
          {course.concept.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      </Section>

      <Section title="架构图">
        <CourseDiagram steps={course.diagram} />
      </Section>

      <Section title="操作步骤">
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {course.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="命令示例">
        <div className="space-y-1">
          {course.commandExamples.map((command) => (
            <pre
              key={command}
              className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100"
            >
              {command}
            </pre>
          ))}
        </div>
      </Section>

      {course.yamlExample && (
        <Section title="YAML 示例">
          <pre className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100">
            {course.yamlExample}
          </pre>
        </Section>
      )}

      <Section title="交互实验">
        {course.verification ? (
          <div className="space-y-2 text-sm">
            <p>{course.verification.instruction}</p>
            <p className="text-slate-500 dark:text-slate-400">
              在 kubectl 终端、YAML 实验室或拖拽设计器里完成上面的操作后，点击"验证"。
            </p>
            <button
              type="button"
              onClick={handleVerify}
              className="rounded-md border border-sky-400 bg-sky-50 px-3 py-1.5 text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
            >
              验证
            </button>
            {verifyMessage && <p>{verifyMessage}</p>}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-slate-500 dark:text-slate-400">
              本课属于讲解型课程，涉及的资源类型或机制当前虚拟集群尚未实现，暂不支持交互校验。
            </p>
            {!completed && (
              <button
                type="button"
                onClick={() => markCourseCompleted(course.id)}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                标记为已完成
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title="知识检查">
        <div className="space-y-4 text-sm">
          {course.quiz.map((question, questionIndex) => (
            <div key={questionIndex}>
              <p className="font-medium">{question.question}</p>
              <div className="mt-1 space-y-1">
                {question.options.map((option, optionIndex) => {
                  const selected = quizAnswers[questionIndex] === optionIndex
                  const showResult = quizSubmitted
                  const isCorrectOption = optionIndex === question.correctIndex
                  return (
                    <label
                      key={optionIndex}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 ${
                        showResult && isCorrectOption
                          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950'
                          : showResult && selected
                            ? 'border-red-400 bg-red-50 dark:bg-red-950'
                            : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`quiz-${course.id}-${questionIndex}`}
                        checked={selected}
                        onChange={() =>
                          setQuizAnswers((prev) => ({
                            ...prev,
                            [questionIndex]: optionIndex,
                          }))
                        }
                        disabled={quizSubmitted}
                      />
                      {option}
                    </label>
                  )
                })}
              </div>
              {quizSubmitted && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {question.explanation}
                </p>
              )}
            </div>
          ))}
          {!quizSubmitted && (
            <button
              type="button"
              onClick={handleSubmitQuiz}
              disabled={Object.keys(quizAnswers).length < course.quiz.length}
              className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              提交答案
            </button>
          )}
        </div>
      </Section>

      <Section title="常见错误">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {course.commonMistakes.map((mistake, index) => (
            <li key={index}>{mistake}</li>
          ))}
        </ul>
      </Section>

      <Section title="本课总结">
        <p className="text-sm leading-relaxed">{course.summary}</p>
      </Section>

      {nextCourse && (
        <Link
          to={`/courses/${nextCourse.id}`}
          className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          下一课：第 {nextCourse.index} 课 {nextCourse.title} →
        </Link>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  )
}
