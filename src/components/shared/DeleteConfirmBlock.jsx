export default function DeleteConfirmBlock({
  show,
  title,
  message,
  onCancel,
  onConfirm,
  confirming,
  t,
}) {
  if (!show) return null

  return (
    <div className="mt-2 mb-2 p-4 rounded-2xl bg-red-50 border border-red-100">
      {title && (
        <p className="text-sm font-semibold text-red-700 mb-1">{title}</p>
      )}
      <p className={title ? 'text-xs text-red-500 mb-3' : 'text-sm text-red-700 mb-3'}>
        {message}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-600"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="flex-1 py-2 rounded-xl text-sm font-medium bg-red-500 text-white disabled:opacity-50"
        >
          {confirming ? '...' : t('yesDelete')}
        </button>
      </div>
    </div>
  )
}
