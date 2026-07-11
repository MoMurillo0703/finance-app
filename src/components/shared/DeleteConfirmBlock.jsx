export default function DeleteConfirmBlock({
  show,
  message,
  onCancel,
  onConfirm,
  confirming,
  t,
}) {
  if (!show) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-2">
      <p className="text-sm text-red-700 mb-3">{message}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 border border-gray-200 rounded-xl text-sm bg-white"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming}
          className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm disabled:opacity-50"
        >
          {confirming ? '...' : t('yesDelete')}
        </button>
      </div>
    </div>
  )
}
