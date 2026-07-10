/*
-- Run in Supabase SQL editor:
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  payday_1 integer,
  payday_2 integer,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);
*/
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import PaydayWizard from './PaydayWizard'

export default function PaydayBanner({ onComplete }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    let active = true

    ;(async () => {
      const { data } = await supabase
        .from('user_settings')
        .select('payday_1, payday_2')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!active) return
      setSettings(data)
      setLoading(false)
    })()

    return () => { active = false }
  }, [user.id])

  if (loading) return null

  const today = new Date().getDate()
  const hasPayday = settings?.payday_1 != null || settings?.payday_2 != null
  const isPayday = hasPayday && (
    today === settings?.payday_1 || today === settings?.payday_2
  )

  if (!hasPayday) {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-800">{t('setPayday')}</p>
      </div>
    )
  }

  if (!isPayday) return null

  return (
    <>
      <div className="mb-4 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-100 to-yellow-100 px-4 py-3 flex justify-between items-center gap-3">
        <p className="text-sm font-medium text-amber-900">{t('itsPayday')}</p>
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-medium"
        >
          {t('startWizard')}
        </button>
      </div>

      {showWizard && (
        <PaydayWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false)
            onComplete?.()
          }}
        />
      )}
    </>
  )
}
