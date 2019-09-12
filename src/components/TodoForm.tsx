import * as React from 'react'

export interface Props {
  isEditing: boolean
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
}

export const TodoForm: React.FunctionComponent<Props> = ({ isEditing, value, onChange, onSubmit }: Props) => (
  <div className="input-group">
    <input type="text" className="form-control" name="task" value={value} onChange={event => onChange(event.target.value)} />
    <div className="input-group-append">
      <button type="submit" className="btn btn-primary" onClick={onSubmit} disabled={value === ''}>
        {isEditing ? 'Edit' : 'Add'}
      </button>
    </div>
  </div>
)