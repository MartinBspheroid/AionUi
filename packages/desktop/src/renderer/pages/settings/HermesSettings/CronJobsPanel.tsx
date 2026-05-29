/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CronJobsPanel — Full CRUD panel for Hermes scheduled cron jobs.
 *
 * Displays a stat-card summary (total / active / paused / errors), an Arco
 * Table listing all jobs, and an Arco Drawer for create/edit forms.
 * All mutating operations go through ipcBridge.acpConversation.hermesExt.*
 * A 404 response from the backend is treated as "endpoint unsupported".
 */

import type {
  HermesCronJobEdit,
  HermesCronJobInput,
  HermesCronJobSummary,
  HermesSkillSummary,
} from '@/common/types/hermes/hermesExt';
import { acpConversation } from '@/common/adapter/ipcBridge';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import {
  Button,
  Drawer,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { Add, Delete, Pause, Play, PlayOne, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormValues = {
  schedule?: string;
  name?: string;
  prompt?: string;
  skills?: string[];
  deliver?: string;
  repeat?: number;
  script?: string;
  workdir?: string;
  no_agent?: boolean;
  profile?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a HermesCronJobEdit containing only fields that changed from the
 * original job. Skills are diffed into add_skills / remove_skills or
 * clear_skills.
 */
function diffEdit(original: HermesCronJobSummary, next: FormValues): HermesCronJobEdit {
  const patch: HermesCronJobEdit = {};

  if (next.schedule !== undefined && next.schedule !== original.schedule_expr) {
    patch.schedule = next.schedule || undefined;
  }
  if (next.name !== undefined && next.name !== original.name) {
    patch.name = next.name || undefined;
  }
  if (next.prompt !== undefined && next.prompt !== '') {
    patch.prompt = next.prompt;
  }
  if (next.deliver !== undefined && next.deliver !== original.deliver) {
    patch.deliver = next.deliver || undefined;
  }
  if (next.repeat !== undefined && next.repeat !== original.repeat_times) {
    patch.repeat = next.repeat;
  }
  if (next.script !== undefined && next.script !== original.script) {
    patch.script = next.script || undefined;
  }
  if (next.workdir !== undefined && next.workdir !== original.workdir) {
    patch.workdir = next.workdir || undefined;
  }
  if (next.no_agent !== undefined && next.no_agent !== original.no_agent) {
    patch.no_agent = next.no_agent;
  }

  // Skill diffing
  if (next.skills !== undefined) {
    const originalSkills: string[] = original.skills ?? [];
    const nextSkills: string[] = next.skills ?? [];
    if (nextSkills.length === 0 && originalSkills.length > 0) {
      patch.clear_skills = true;
    } else {
      const added = nextSkills.filter((s) => !originalSkills.includes(s));
      const removed = originalSkills.filter((s) => !nextSkills.includes(s));
      if (added.length > 0) patch.add_skills = added;
      if (removed.length > 0) patch.remove_skills = removed;
    }
  }

  return patch;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// StatCard sub-component
// ---------------------------------------------------------------------------

type StatCardProps = {
  label: string;
  value: number;
  colorClass: string;
};

const StatCard: React.FC<StatCardProps> = ({ label, value, colorClass }) => (
  <div className='flex-1 min-w-[80px] flex flex-col items-center justify-center gap-4px p-16px bg-base border border-b-base rd-12px shadow-sm'>
    <span className={`text-24px font-bold ${colorClass}`}>{value}</span>
    <span className='text-12px text-t-secondary'>{label}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type CronJobsPanelProps = {
  /** When false, renders without extra wrapper padding — suitable for embedding in a tab */
  withWrapper?: boolean;
};

const CronJobsPanel: React.FC<CronJobsPanelProps> = ({ withWrapper = false }) => {
  const { t } = useTranslation();

  // ---- Data state ----------------------------------------------------------
  const [jobs, setJobs] = useState<HermesCronJobSummary[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, paused: 0, errors: 0 });
  const [skills, setSkills] = useState<HermesSkillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // ---- Drawer state --------------------------------------------------------
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingJob, setEditingJob] = useState<HermesCronJobSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<FormValues>();

  // ---- Load ----------------------------------------------------------------
  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await acpConversation.hermesExt.listCronJobs.invoke();
      setJobs(res.jobs ?? []);
      setStats({
        total: res.total ?? 0,
        active: res.active ?? 0,
        paused: res.paused ?? 0,
        errors: res.errors ?? 0,
      });
      setUnsupported(false);
    } catch (err) {
      if (isBackendHttpError(err) && err.status === 404) {
        setUnsupported(true);
      } else {
        Message.error(t('settings.hermes.cron.loadError'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadSkills = useCallback(async () => {
    try {
      const res = await acpConversation.hermesExt.listSkills.invoke();
      setSkills(res.skills ?? []);
    } catch {
      // Skills are optional — silently ignore failures
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    void loadSkills();
  }, [loadJobs, loadSkills]);

  // ---- Drawer helpers -------------------------------------------------------
  const openCreate = () => {
    setEditingJob(null);
    form.resetFields();
    setDrawerVisible(true);
  };

  const openEdit = (job: HermesCronJobSummary) => {
    setEditingJob(job);
    form.setFieldsValue({
      schedule: job.schedule_expr ?? '',
      name: job.name,
      prompt: '',
      skills: job.skills ?? [],
      deliver: job.deliver ?? '',
      repeat: job.repeat_times ?? undefined,
      script: job.script ?? '',
      workdir: job.workdir ?? '',
      no_agent: job.no_agent ?? false,
    });
    setDrawerVisible(true);
  };

  const closeDrawer = () => {
    setDrawerVisible(false);
    setEditingJob(null);
    form.resetFields();
  };

  // ---- Save (create / update) ----------------------------------------------
  const handleSave = async () => {
    let values: FormValues;
    try {
      values = await form.validate();
    } catch {
      return;
    }

    setSaving(true);
    try {
      if (editingJob) {
        // Update — only send changed fields
        const patch = diffEdit(editingJob, values);
        if (Object.keys(patch).length === 0) {
          Message.info(t('settings.hermes.cron.form.noChanges'));
          setSaving(false);
          return;
        }
        await acpConversation.hermesExt.updateCronJob.invoke({ id: editingJob.id, patch });
        Message.success(t('settings.hermes.cron.toasts.updated'));
      } else {
        // Create
        const input: HermesCronJobInput = {
          schedule: values.schedule!,
          name: values.name || undefined,
          prompt: values.prompt || undefined,
          skills: values.skills?.length ? values.skills : undefined,
          deliver: values.deliver || undefined,
          repeat: values.repeat ?? undefined,
          script: values.script || undefined,
          workdir: values.workdir || undefined,
          no_agent: values.no_agent ?? undefined,
          profile: values.profile || undefined,
        };
        await acpConversation.hermesExt.createCronJob.invoke(input);
        Message.success(t('settings.hermes.cron.toasts.created'));
      }
      closeDrawer();
      void loadJobs();
    } catch (err) {
      console.error('CronJobsPanel save failed:', err);
      Message.error(t('settings.hermes.cron.toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete ---------------------------------------------------------------
  const handleDelete = (job: HermesCronJobSummary) => {
    Modal.confirm({
      title: t('settings.hermes.cron.confirmDelete.title'),
      content: t('settings.hermes.cron.confirmDelete.content', { name: job.name }),
      okButtonProps: { status: 'danger' },
      okText: t('common.delete', { defaultValue: 'Delete' }),
      onOk: async () => {
        try {
          await acpConversation.hermesExt.deleteCronJob.invoke({ id: job.id });
          Message.success(t('settings.hermes.cron.toasts.deleted'));
          void loadJobs();
        } catch {
          Message.error(t('settings.hermes.cron.toasts.deleteFailed'));
        }
      },
    });
  };

  // ---- Run now ---------------------------------------------------------------
  const handleRun = async (job: HermesCronJobSummary) => {
    try {
      await acpConversation.hermesExt.runCronJob.invoke({ id: job.id });
      Message.success(t('settings.hermes.cron.toasts.queuedRun'));
    } catch {
      Message.error(t('settings.hermes.cron.toasts.runFailed'));
    }
  };

  // ---- Pause / Resume -------------------------------------------------------
  const handleToggle = async (job: HermesCronJobSummary) => {
    const isPaused = job.state === 'paused';
    try {
      if (isPaused) {
        await acpConversation.hermesExt.resumeCronJob.invoke({ id: job.id });
        Message.success(t('settings.hermes.cron.toasts.resumed'));
      } else {
        await acpConversation.hermesExt.pauseCronJob.invoke({ id: job.id });
        Message.success(t('settings.hermes.cron.toasts.paused'));
      }
      void loadJobs();
    } catch {
      Message.error(t('settings.hermes.cron.toasts.toggleFailed'));
    }
  };

  // ---- Skill options for Select ---------------------------------------------
  const skillOptions = useMemo(() => skills.map((s) => ({ label: s.id, value: s.id })), [skills]);

  // ---- Table columns --------------------------------------------------------
  const columns = useMemo(
    () => [
      {
        title: t('settings.hermes.cron.columns.name'),
        dataIndex: 'name',
        key: 'name',
        render: (_: unknown, job: HermesCronJobSummary) => (
          <div className='flex flex-col gap-2px'>
            <span className='text-13px font-medium text-t-primary'>{job.name}</span>
            <span className='text-11px text-t-tertiary font-mono'>{job.id}</span>
          </div>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.status'),
        dataIndex: 'state',
        key: 'state',
        width: 100,
        render: (_: unknown, job: HermesCronJobSummary) => {
          const state = job.state ?? (job.enabled ? 'active' : 'paused');
          const colorMap: Record<string, string> = {
            active: 'green',
            paused: 'orange',
            error: 'red',
          };
          const labelMap: Record<string, string> = {
            active: t('settings.hermes.cron.status.active'),
            paused: t('settings.hermes.cron.status.paused'),
            error: t('settings.hermes.cron.status.error'),
          };
          return (
            <Tag color={colorMap[state] ?? 'gray'} size='small'>
              {labelMap[state] ?? state}
            </Tag>
          );
        },
      },
      {
        title: t('settings.hermes.cron.columns.schedule'),
        dataIndex: 'schedule_display',
        key: 'schedule',
        render: (_: unknown, job: HermesCronJobSummary) => job.schedule_display ?? job.schedule_expr ?? '—',
      },
      {
        title: t('settings.hermes.cron.columns.nextRun'),
        dataIndex: 'next_run_at',
        key: 'next_run_at',
        render: (_: unknown, job: HermesCronJobSummary) => (
          <span className='text-12px text-t-secondary'>{formatDateTime(job.next_run_at)}</span>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.lastRun'),
        dataIndex: 'last_run_at',
        key: 'last_run_at',
        render: (_: unknown, job: HermesCronJobSummary) => {
          const repeatLabel =
            job.repeat_times == null
              ? `${job.repeat_completed ?? 0}/∞`
              : `${job.repeat_completed ?? 0}/${job.repeat_times}`;
          return (
            <div className='flex flex-col gap-2px'>
              <span className='text-12px text-t-secondary'>{formatDateTime(job.last_run_at)}</span>
              <span className='text-11px text-t-tertiary'>{repeatLabel}</span>
            </div>
          );
        },
      },
      {
        title: t('settings.hermes.cron.columns.details'),
        dataIndex: 'last_error',
        key: 'details',
        render: (_: unknown, job: HermesCronJobSummary) => {
          const errorText = job.last_error ?? job.last_delivery_error;
          if (!errorText) return <span className='text-12px text-t-tertiary'>—</span>;
          return (
            <span className='text-11px text-danger-6 line-clamp-2' title={errorText}>
              {errorText}
            </span>
          );
        },
      },
      {
        title: t('settings.hermes.cron.columns.actions'),
        key: 'actions',
        width: 160,
        render: (_: unknown, job: HermesCronJobSummary) => {
          const isPaused = job.state === 'paused';
          return (
            <div className='flex items-center gap-4px'>
              <Button
                size='mini'
                type='text'
                icon={<Play size={14} />}
                title={t('settings.hermes.cron.actions.run')}
                onClick={() => void handleRun(job)}
              />
              <Button
                size='mini'
                type='text'
                icon={isPaused ? <PlayOne size={14} /> : <Pause size={14} />}
                title={isPaused ? t('settings.hermes.cron.actions.resume') : t('settings.hermes.cron.actions.pause')}
                onClick={() => void handleToggle(job)}
              />
              <Button
                size='mini'
                type='text'
                title={t('settings.hermes.cron.actions.edit')}
                onClick={() => openEdit(job)}
              >
                {t('settings.hermes.cron.actions.edit')}
              </Button>
              <Button
                size='mini'
                type='text'
                status='danger'
                icon={<Delete size={14} />}
                title={t('settings.hermes.cron.actions.delete')}
                onClick={() => handleDelete(job)}
              />
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, skills]
  );

  // ---- Unsupported notice ---------------------------------------------------
  if (unsupported) {
    return (
      <div className='flex flex-col items-center justify-center py-48px gap-12px text-center px-24px'>
        <Typography.Title heading={5} className='m-0'>
          {t('settings.hermes.cron.unsupportedTitle')}
        </Typography.Title>
        <Typography.Text type='secondary' className='max-w-[480px]'>
          {t('settings.hermes.cron.unsupportedDescription')}
        </Typography.Text>
      </div>
    );
  }

  // ---- Main render ----------------------------------------------------------
  const isCreating = editingJob === null;

  const content = (
    <div className='flex flex-col gap-16px'>
      {/* Toolbar */}
      <div className='flex items-center justify-between gap-12px flex-wrap'>
        <Typography.Title heading={6} className='m-0 text-t-primary'>
          {t('settings.hermes.cron.title')}
        </Typography.Title>
        <div className='flex items-center gap-8px'>
          <Button
            size='small'
            icon={<Refresh size={14} className={loading ? 'animate-spin' : ''} />}
            onClick={() => void loadJobs()}
            title={t('common.refresh', { defaultValue: 'Refresh' })}
          />
          <Button type='primary' size='small' icon={<Add size={14} />} onClick={openCreate}>
            {t('settings.hermes.cron.actions.create')}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className='flex items-stretch gap-12px flex-wrap'>
        <StatCard label={t('settings.hermes.cron.summary.total')} value={stats.total} colorClass='text-t-primary' />
        <StatCard label={t('settings.hermes.cron.summary.active')} value={stats.active} colorClass='text-success-6' />
        <StatCard label={t('settings.hermes.cron.summary.paused')} value={stats.paused} colorClass='text-warning-6' />
        <StatCard label={t('settings.hermes.cron.summary.errors')} value={stats.errors} colorClass='text-danger-6' />
      </div>

      {/* Table */}
      <Table
        data-testid='cron-jobs-table'
        rowKey='id'
        columns={columns}
        data={jobs}
        loading={loading}
        pagination={false}
        noDataElement={
          <div className='text-center text-t-secondary py-40px text-13px'>{t('settings.hermes.cron.empty')}</div>
        }
        size='small'
        scroll={{ x: true }}
      />

      {/* Create / Edit Drawer */}
      <Drawer
        title={isCreating ? t('settings.hermes.cron.form.createTitle') : t('settings.hermes.cron.form.editTitle')}
        visible={drawerVisible}
        placement='right'
        width={480}
        zIndex={1200}
        getPopupContainer={() => document.body}
        onCancel={closeDrawer}
        footer={
          <div className='flex items-center justify-end gap-8px'>
            <Button onClick={closeDrawer}>{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
            <Button type='primary' loading={saving} onClick={() => void handleSave()}>
              {isCreating ? t('common.create', { defaultValue: 'Create' }) : t('common.save', { defaultValue: 'Save' })}
            </Button>
          </div>
        }
        headerStyle={{ background: 'var(--color-bg-1)' }}
        bodyStyle={{ background: 'var(--color-bg-1)' }}
      >
        <Form form={form} layout='vertical' autoComplete='off' className='flex flex-col gap-0'>
          {/* Schedule — required on create, optional on edit */}
          <Form.Item
            label={t('settings.hermes.cron.form.schedule')}
            field='schedule'
            rules={isCreating ? [{ required: true, message: t('settings.hermes.cron.form.scheduleRequired') }] : []}
          >
            <Input placeholder={t('settings.hermes.cron.form.scheduleHint')} data-testid='input-cron-schedule' />
          </Form.Item>

          {/* Name */}
          <Form.Item label={t('settings.hermes.cron.form.name')} field='name'>
            <Input placeholder={t('settings.hermes.cron.form.namePlaceholder')} data-testid='input-cron-name' />
          </Form.Item>

          {/* Prompt */}
          <Form.Item
            label={isCreating ? t('settings.hermes.cron.form.prompt') : t('settings.hermes.cron.form.promptEdit')}
            field='prompt'
          >
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 8 }}
              placeholder={isCreating ? undefined : t('settings.hermes.cron.form.promptEditHint')}
              data-testid='input-cron-prompt'
            />
          </Form.Item>

          {/* Skills */}
          <Form.Item label={t('settings.hermes.cron.form.skills')} field='skills'>
            <Select
              mode='multiple'
              allowClear
              placeholder={t('settings.hermes.cron.form.skills')}
              options={skillOptions}
              data-testid='select-cron-skills'
            />
          </Form.Item>

          {/* Deliver */}
          <Form.Item label={t('settings.hermes.cron.form.deliver')} field='deliver'>
            <Input data-testid='input-cron-deliver' />
          </Form.Item>

          {/* Repeat */}
          <Form.Item label={t('settings.hermes.cron.form.repeat')} field='repeat'>
            <InputNumber min={1} placeholder='∞' data-testid='input-cron-repeat' className='w-full' />
          </Form.Item>

          {/* Script */}
          <Form.Item label={t('settings.hermes.cron.form.script')} field='script'>
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} data-testid='input-cron-script' />
          </Form.Item>

          {/* Workdir */}
          <Form.Item label={t('settings.hermes.cron.form.workdir')} field='workdir'>
            <Input data-testid='input-cron-workdir' />
          </Form.Item>

          {/* No-agent switch */}
          <Form.Item label={t('settings.hermes.cron.form.noAgent')} field='no_agent' triggerPropName='checked'>
            <Switch data-testid='switch-cron-no-agent' />
          </Form.Item>

          {/* Profile — create only */}
          {isCreating && (
            <Form.Item label={t('settings.hermes.cron.form.profile')} field='profile'>
              <Input data-testid='input-cron-profile' />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );

  if (withWrapper) {
    return <div className='px-[16px] md:px-[32px] py-32px'>{content}</div>;
  }
  return content;
};

export default CronJobsPanel;
