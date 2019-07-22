import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { contramap, ordBoolean, ordString } from 'fp-ts/es6/Ord'
import { sort } from 'fp-ts/es6/Array'
import * as R from 'fp-ts/es6/Record'
import * as O from 'fp-ts/es6/Option'
import { pipe } from 'fp-ts/es6/pipeable'
import { atRecord } from 'monocle-ts/es6/At/Record'
import { Prism, Lens } from 'monocle-ts/es6'
import { getSemigroup, ordNumber } from 'fp-ts/lib/Ord'
import * as E from 'fp-ts/lib/Either'
import * as t from 'io-ts'
import { withFallback } from 'io-ts-types/lib/withFallback'
import { getFirstSemigroup, getJoinSemigroup, fold } from 'fp-ts/es6/Semigroup'
import * as A from 'fp-ts/lib/Array'
import { action, cmd, html, http, platform } from 'effe-ts'
import { Title } from './components/Title'
import { TaskForm } from './components/TaskForm'
import { EmptyTask } from './components/EmptyTask'
import { Task as TaskComponent } from './components/Task'

const Task = t.interface(
  {
    id: t.number,
    text: t.string,
    isDone: t.boolean,
    isFav: withFallback(t.boolean, false)
  },
  'Task'
)
type Task = t.TypeOf<typeof Task>

// Function for creating an empty task
const task = (id: number): Task => ({
  id,
  text: '',
  isDone: false,
  isFav: false
})

// Define how tasks should be ordered
const ordTaskText = contramap<string, Task>(task => task.text)(ordString) // Order by text
const ordTaskIsDone = contramap<boolean, Task>(task => task.isDone)(ordBoolean) // Order by isDone
const ordTask = getSemigroup<Task>().concat(ordTaskIsDone, ordTaskText) // Combine both ordering strategies

// Util
const groupTasksBy = R.fromFoldableMap(getFirstSemigroup<Task>(), A.array)
// Determine the next task id by getting the maximum task id and add one. If empty return 1 as default value
const nextTaskId = (tasks: Record<string, Task>) =>
  fold(getJoinSemigroup(ordNumber))(1, Object.values(tasks).map(task => task.id)) + 1

// The single state tree used by the application
interface Model {
  current: Task
  tasks: Record<string, Task>
}

// Lenses for the `Model`
const currentLens = Lens.fromProp<Model>()('current')
const currentTextLens = currentLens.composeLens(Lens.fromProp<Task>()('text'))
const tasksLens = Lens.fromProp<Model>()('tasks')
const taskByIdOptional = (id: number) => tasksLens.composeLens(atRecord<Task>().at(String(id))).composePrism(Prism.some())

// All actions that can happen in our application
const Action = action.create({
  Add: {},
  Edit: action.withPayload<{ task: Task }>(),
  Load: action.withPayload<{ response: E.Either<http.HttpErrorResponse, http.Response<Task[]>> }>(),
  ToggleDone: action.withPayload<{ task: Task }>(),
  ToggleFav: action.withPayload<{ task: Task }>(),
  Remove: action.withPayload<{ task: Task }>(),
  UpdateText: action.withPayload<{ text: string }>()
})
type Action = action.ActionOf<typeof Action>

// Commands
// Load tasks from json file
const load: cmd.Cmd<Action> = http.send(http.get(require('./tasks.json'), t.array(Task)), response => Action.Load({ response }))

// Generate the initial state of our application and trigger a command if wanted
const init: [Model, cmd.Cmd<Action>] = [
  {
    current: task(1),
    tasks: {}
  },
  load
]

const update = (action: Action, model: Model): [Model, cmd.Cmd<Action>] =>
  Action.match(action, {
    Add: () => {
      // Add the new task to the existing tasks
      const tasks = pipe(
        model.tasks,
        R.insertAt(String(model.current.id), model.current)
      )
      // Generate the new current task based on the newly created tasks record to determine the next possible id
      const current = task(nextTaskId(tasks))
      return [
        {
          current,
          tasks
        },
        cmd.none
      ]
    },
    Edit: ({ task }) => [currentLens.set(task)(model), cmd.none],
    Load: ({ response }) =>
      pipe(
        response,
        E.fold(
          // If the response is an error do nothing by returning the current model
          () => [model, cmd.none],
          // Else evaluate the http response
          response => {
            const tasks = groupTasksBy(response.body, task => [String(task.id), task])
            const current = task(nextTaskId(tasks))
            return [
              {
                current,
                tasks
              },
              cmd.none
            ]
          }
        )
      ),
    ToggleDone: ({ task }) => [taskByIdOptional(task.id).modify(task => ({ ...task, isDone: !task.isDone }))(model), cmd.none],
    ToggleFav: ({ task }) => [taskByIdOptional(task.id).modify(task => ({ ...task, isFav: !task.isFav }))(model), cmd.none],
    Remove: ({ task }) => [tasksLens.modify(R.deleteAt(String(task.id)))(model), cmd.none],
    UpdateText: ({ text }) => [currentTextLens.set(text)(model), cmd.none],
    default: () => [model, cmd.none]
  })

const view = (model: Model) => {
  // Convert tasks record to array and sort
  const tasks = sort(ordTask)(Object.values(model.tasks))
  const done = tasks.filter(task => task.isDone).length
  const total = tasks.length
  // If the current task id is equal to a task that already exists in tasks we are editing
  const isEditing = O.isSome(R.lookup(String(model.current.id), model.tasks))

  return (dispatch: platform.Dispatch<Action>) => (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <Title done={done} total={total} />
        </h3>
      </div>
      <div className="card-body">
        <TaskForm
          isEditing={isEditing}
          value={model.current.text}
          onChange={text => dispatch(Action.UpdateText({ text }))}
          onSubmit={() => dispatch(Action.Add())}
        />
      </div>
      <ul className="list-group list-group-flush">
        {/* If we have no tasks we show a placeholder */}
        {total === 0 ? <EmptyTask /> : null}
        {tasks.map(task => (
          <TaskComponent
            key={task.id}
            {...task}
            onEdit={() => dispatch(Action.Edit({ task }))}
            onRemove={() => dispatch(Action.Remove({ task }))}
            onToggleDone={() => dispatch(Action.ToggleDone({ task }))}
            onToggleFav={() => dispatch(Action.ToggleFav({ task }))}
          />
        ))}
      </ul>
    </div>
  )
}

const app = html.program(init, update, view)

html.run(app, dom => {
  ReactDOM.render(dom, document.getElementById('app'))
})