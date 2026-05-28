/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type {
  HermesCronJobEdit,
  HermesCronJobInput,
  HermesCronJobSummary,
  HermesCronJobsResponse,
  HermesSkillSummary,
} from '@/common/types/hermes/hermesExt';
import {
  Alert,
  Button,
  Drawer,
  Empty,
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
import { Delete, Edit, Pause, Play, PlayOne, Plus, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelHeader, PanelLoading, SectionCard, StatCard } from './components';

const { TextArea } = Input;

type HermesCronJobsState = HermesCronJobsResponse;

type CronFormValues = {
  schedule: string;
  prompt?: string;
  name?: string;
  deliver?: string;
  repeat?: number;
  skills?: string[];
  script?: string;
  workdir?: string;
  profile?: string;
  no_agent?: boolean;
};

const EMPTY_FORM: CronFormValues = {
  schedule: '',
  prompt: '',
  name: '',
  deliver: '',
  skills: [],
  script: '',
  workdir: '',
  profile: '',
  no_agent: false,
};

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRepeat(job: HermesCronJobSummary): string {
  if (job.repeat_times == null) return job.repeat_completed == null ? '' : `${job.repeat_completed}/∞`;
  return `${job.repeat_completed ?? 0}/${job.repeat_times}`;
}

function jobToFormValues(job: HermesCronJobSummary): CronFormValues {
  return {
    schedule: job.schedule_expr || job.schedule_display || '',
    prompt: '',
    name: job.name || '',
    deliver: job.deliver || '',
    repeat: job.repeat_times ?? undefined,
    skills: job.skills ?? [],
    script: job.script || '',
    workdir: job.workdir || '',
    profile: '',
    no_agent: !!job.no_agent,
  };
}

function valuesToCreatePayload(values: CronFormValues): HermesCronJobInput {
  return {
    schedule: values.schedule.trim(),
    prompt: values.prompt?.trim() || undefined,
    name: values.name?.trim() || undefined,
    deliver: values.deliver?.trim() || undefined,
    repeat: typeof values.repeat === 'number' ? values.repeat : undefined,
    skills: values.skills && values.skills.length > 0 ? values.skills : undefined,
    script: values.script?.trim() || undefined,
    workdir: values.workdir?.trim() || undefined,
    profile: values.profile?.trim() || undefined,
    no_agent: values.no_agent === true ? true : undefined,
  };
}

function valuesToEditPayload(values: CronFormValues, original: HermesCronJobSummary): HermesCronJobEdit {
  const patch: HermesCronJobEdit = {};
  const trim = (s?: string): string | undefined => (typeof s === 'string' ? s.trim() : undefined);
  if (trim(values.schedule) && trim(values.schedule) !== (original.schedule_expr || original.schedule_display)) {
    patch.schedule = trim(values.schedule);
  }
  const promptInput = values.prompt?.trim() || '';
  if (promptInput) patch.prompt = promptInput;
  if (trim(values.name) !== (original.name || '')) patch.name = trim(values.name) || '';
  if (trim(values.deliver) !== (original.deliver || '')) patch.deliver = trim(values.deliver) || '';
  if ((values.repeat ?? null) !== (original.repeat_times ?? null)) {
    if (typeof values.repeat === 'number') patch.repeat = values.repeat;
  }
  const desiredSkills = values.skills ?? [];
  const originalSkills = original.skills ?? [];
  const skillsChanged =
    desiredSkills.length !== originalSkills.length || desiredSkills.some((skill, idx) => skill !== originalSkills[idx]);
  if (skillsChanged) {
    if (desiredSkills.length === 0) patch.clear_skills = true;
    else patch.skills = desiredSkills;
  }
  if ((values.script || '') !== (original.script || '')) patch.script = values.script || '';
  if ((values.workdir || '') !== (original.workdir || '')) patch.workdir = values.workdir || '';
  if (values.no_agent !== !!original.no_agent) patch.no_agent = values.no_agent === true;
  return patch;
}

function isUnsupportedError(error: unknown): boolean {
  return isBackendHttpError(error) && error.status === 404;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isBackendHttpError(error) && error.backendMessage.trim().length > 0) return error.backendMessage;
  return fallback;
}

const CronJobsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<HermesCronJobsState>({ jobs: [], total: 0, active: 0, paused: 0, errors: 0 });
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<HermesCronJobSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skills, setSkills] = useState<HermesSkillSummary[]>([]);
  const [form] = Form.useForm<CronFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcBridge.acpConversation.hermesExt.listCronJobs.invoke();
      setState(result);
      setUnsupported(false);
    } catch (loadError) {
      if (isUnsupportedError(loadError)) {
        setUnsupported(true);
        setState({ jobs: [], total: 0, active: 0, paused: 0, errors: 0 });
        return;
      }
      setError(t('settings.hermes.cron.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadSkills = useCallback(async () => {
    try {
      const result = await ipcBridge.acpConversation.hermesExt.listSkills.invoke();
      setSkills(result.skills);
    } catch {
      // Skill picker is optional; failing silently is fine.
    }
  }, []);

  useEffect(() => {
    void load();
    void loadSkills();
  }, [load, loadSkills]);

  const markBusy = useCallback((id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.setFieldsValue(EMPTY_FORM);
    setDrawerOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (job: HermesCronJobSummary) => {
      setEditing(job);
      form.setFieldsValue(jobToFormValues(job));
      setDrawerOpen(true);
    },
    [form]
  );

  const handleSubmit = useCallback(async () => {
    let values: CronFormValues;
    try {
      values = await form.validate();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        const patch = valuesToEditPayload(values, editing);
        if (Object.keys(patch).length === 0) {
          Message.info(t('settings.hermes.cron.form.noChanges'));
          setSubmitting(false);
          return;
        }
        await ipcBridge.acpConversation.hermesExt.updateCronJob.invoke({ id: editing.id, patch });
        Message.success(t('settings.hermes.cron.toasts.updated'));
      } else {
        await ipcBridge.acpConversation.hermesExt.createCronJob.invoke(valuesToCreatePayload(values));
        Message.success(t('settings.hermes.cron.toasts.created'));
      }
      setDrawerOpen(false);
      await load();
    } catch (submitError) {
      Message.error(getErrorMessage(submitError, t('settings.hermes.cron.toasts.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  }, [editing, form, load, t]);

  const runJob = useCallback(
    async (job: HermesCronJobSummary) => {
      markBusy(job.id, true);
      try {
        await ipcBridge.acpConversation.hermesExt.runCronJob.invoke({ id: job.id });
        Message.success(t('settings.hermes.cron.toasts.queuedRun'));
      } catch (runError) {
        Message.error(getErrorMessage(runError, t('settings.hermes.cron.toasts.runFailed')));
      } finally {
        markBusy(job.id, false);
      }
    },
    [markBusy, t]
  );

  const togglePause = useCallback(
    async (job: HermesCronJobSummary) => {
      markBusy(job.id, true);
      try {
        const shouldPause = job.enabled && job.state !== 'paused';
        if (shouldPause) {
          await ipcBridge.acpConversation.hermesExt.pauseCronJob.invoke({ id: job.id });
          Message.success(t('settings.hermes.cron.toasts.paused'));
        } else {
          await ipcBridge.acpConversation.hermesExt.resumeCronJob.invoke({ id: job.id });
          Message.success(t('settings.hermes.cron.toasts.resumed'));
        }
        await load();
      } catch (toggleError) {
        Message.error(getErrorMessage(toggleError, t('settings.hermes.cron.toasts.toggleFailed')));
      } finally {
        markBusy(job.id, false);
      }
    },
    [load, markBusy, t]
  );

  const deleteJob = useCallback(
    (job: HermesCronJobSummary) => {
      Modal.confirm({
        title: t('settings.hermes.cron.confirmDelete.title'),
        content: t('settings.hermes.cron.confirmDelete.content', { name: job.name || job.id }),
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          markBusy(job.id, true);
          try {
            await ipcBridge.acpConversation.hermesExt.deleteCronJob.invoke({ id: job.id });
            Message.success(t('settings.hermes.cron.toasts.deleted'));
            await load();
          } catch (deleteError) {
            Message.error(getErrorMessage(deleteError, t('settings.hermes.cron.toasts.deleteFailed')));
          } finally {
            markBusy(job.id, false);
          }
        },
      });
    },
    [load, markBusy, t]
  );

  const skillOptions = useMemo(() => skills.map((skill) => ({ label: skill.id, value: skill.name })), [skills]);

  const columns = useMemo(
    () => [
      {
        title: t('settings.hermes.cron.columns.name'),
        dataIndex: 'name',
        render: (_value: unknown, record: HermesCronJobSummary) => (
          <div className='min-w-0 flex flex-col gap-2px'>
            <Typography.Text className='font-500' ellipsis>
              {record.name || record.id}
            </Typography.Text>
            <Typography.Text type='secondary' className='text-12px' ellipsis>
              {record.id}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.status'),
        dataIndex: 'last_status',
        render: (_value: unknown, record: HermesCronJobSummary) => {
          const hasError = record.last_status === 'error' || !!record.last_error || !!record.last_delivery_error;
          if (hasError) return <Tag color='red'>{t('settings.hermes.cron.status.error')}</Tag>;
          if (!record.enabled || record.state === 'paused')
            return <Tag color='orange'>{t('settings.hermes.cron.status.paused')}</Tag>;
          return <Tag color='green'>{t('settings.hermes.cron.status.active')}</Tag>;
        },
      },
      {
        title: t('settings.hermes.cron.columns.schedule'),
        dataIndex: 'schedule_display',
        render: (_value: unknown, record: HermesCronJobSummary) => (
          <div className='min-w-0 flex flex-col gap-2px'>
            <Typography.Text ellipsis>{record.schedule_display || record.schedule_expr || '-'}</Typography.Text>
            {record.schedule_kind ? (
              <Typography.Text type='secondary' className='text-12px'>
                {record.schedule_kind}
              </Typography.Text>
            ) : null}
          </div>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.nextRun'),
        dataIndex: 'next_run_at',
        render: (value?: string) => (
          <Typography.Text type={value ? undefined : 'secondary'}>{formatDateTime(value) || '-'}</Typography.Text>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.lastRun'),
        dataIndex: 'last_run_at',
        render: (_value: unknown, record: HermesCronJobSummary) => (
          <div className='min-w-0 flex flex-col gap-2px'>
            <Typography.Text type={record.last_run_at ? undefined : 'secondary'}>
              {formatDateTime(record.last_run_at) || '-'}
            </Typography.Text>
            <Typography.Text type='secondary' className='text-12px'>
              {formatRepeat(record) || '-'}
            </Typography.Text>
          </div>
        ),
      },
      {
        title: t('settings.hermes.cron.columns.details'),
        dataIndex: 'details',
        render: (_value: unknown, record: HermesCronJobSummary) => {
          const details = [
            record.script,
            record.no_agent ? 'no-agent' : undefined,
            record.provider,
            record.model,
            record.deliver,
          ]
            .filter(Boolean)
            .join(' · ');
          const problem = record.last_error || record.last_delivery_error;
          return (
            <div className='min-w-0 flex flex-col gap-2px'>
              <Typography.Text type={details ? undefined : 'secondary'} ellipsis>
                {details || '-'}
              </Typography.Text>
              {problem ? (
                <Typography.Text type='error' className='text-12px' ellipsis>
                  {problem}
                </Typography.Text>
              ) : null}
            </div>
          );
        },
      },
      {
        title: t('settings.hermes.cron.columns.actions'),
        dataIndex: 'actions',
        render: (_value: unknown, record: HermesCronJobSummary) => {
          const busy = busyIds.has(record.id);
          const paused = !record.enabled || record.state === 'paused';
          return (
            <div className='flex items-center gap-4px'>
              <Button
                size='mini'
                type='text'
                icon={<PlayOne theme='outline' />}
                loading={busy}
                onClick={() => void runJob(record)}
                title={t('settings.hermes.cron.actions.run')}
              />
              <Button
                size='mini'
                type='text'
                icon={paused ? <Play theme='outline' /> : <Pause theme='outline' />}
                loading={busy}
                onClick={() => void togglePause(record)}
                title={t(paused ? 'settings.hermes.cron.actions.resume' : 'settings.hermes.cron.actions.pause')}
              />
              <Button
                size='mini'
                type='text'
                icon={<Edit theme='outline' />}
                onClick={() => openEdit(record)}
                title={t('settings.hermes.cron.actions.edit')}
              />
              <Button
                size='mini'
                type='text'
                status='danger'
                icon={<Delete theme='outline' />}
                onClick={() => deleteJob(record)}
                title={t('settings.hermes.cron.actions.delete')}
              />
            </div>
          );
        },
      },
    ],
    [busyIds, deleteJob, openEdit, runJob, t, togglePause]
  );

  if (loading) {
    return <PanelLoading />;
  }

  if (unsupported) {
    return (
      <Alert
        type='warning'
        title={t('settings.hermes.cron.unsupportedTitle')}
        content={t('settings.hermes.cron.unsupportedDescription')}
      />
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <PanelHeader
        title={t('settings.hermes.cron.title')}
        description={t('settings.hermes.cron.description')}
        action={
          <>
            <Button icon={<Refresh />} onClick={() => void load()}>
              {t('common.reload')}
            </Button>
            <Button type='primary' icon={<Plus />} onClick={openCreate}>
              {t('settings.hermes.cron.actions.create')}
            </Button>
          </>
        }
      />

      <div className='grid grid-cols-2 lg:grid-cols-4 gap-12px'>
        <StatCard label={t('settings.hermes.cron.summary.total')} value={state.total} />
        <StatCard
          label={t('settings.hermes.cron.summary.active')}
          value={state.active}
          valueClassName='text-success-6'
        />
        <StatCard
          label={t('settings.hermes.cron.summary.paused')}
          value={state.paused}
          valueClassName='text-warning-6'
        />
        <StatCard
          label={t('settings.hermes.cron.summary.errors')}
          value={state.errors}
          valueClassName='text-danger-6'
        />
      </div>

      {error ? <Alert type='error' content={error} /> : null}

      <SectionCard title={t('settings.hermes.cron.tabTitle')}>
        {state.jobs.length === 0 ? (
          <Empty description={t('settings.hermes.cron.empty')} />
        ) : (
          <Table rowKey='id' columns={columns} data={state.jobs} pagination={false} scroll={{ x: true }} />
        )}
      </SectionCard>

      <Drawer
        visible={drawerOpen}
        title={editing ? t('settings.hermes.cron.form.editTitle') : t('settings.hermes.cron.form.createTitle')}
        onCancel={() => setDrawerOpen(false)}
        onOk={() => void handleSubmit()}
        okText={editing ? t('common.save') : t('settings.hermes.cron.actions.create')}
        confirmLoading={submitting}
        width={520}
      >
        <Form layout='vertical' form={form} initialValues={EMPTY_FORM}>
          <Form.Item
            label={t('settings.hermes.cron.form.schedule')}
            field='schedule'
            rules={[{ required: !editing, message: t('settings.hermes.cron.form.scheduleRequired') }]}
            extra={t('settings.hermes.cron.form.scheduleHint')}
          >
            <Input placeholder='30m | every 2h | 0 9 * * *' />
          </Form.Item>
          <Form.Item label={t('settings.hermes.cron.form.name')} field='name'>
            <Input placeholder={t('settings.hermes.cron.form.namePlaceholder')} />
          </Form.Item>
          <Form.Item
            label={editing ? t('settings.hermes.cron.form.promptEdit') : t('settings.hermes.cron.form.prompt')}
            field='prompt'
            extra={editing ? t('settings.hermes.cron.form.promptEditHint') : undefined}
          >
            <TextArea autoSize={{ minRows: 4, maxRows: 12 }} />
          </Form.Item>
          <Form.Item label={t('settings.hermes.cron.form.skills')} field='skills'>
            <Select mode='multiple' options={skillOptions} allowCreate placeholder='dogfood' />
          </Form.Item>
          <Form.Item label={t('settings.hermes.cron.form.deliver')} field='deliver' extra='origin | local | telegram'>
            <Input placeholder='local' />
          </Form.Item>
          <Form.Item label={t('settings.hermes.cron.form.repeat')} field='repeat'>
            <InputNumber min={1} placeholder='∞' style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('settings.hermes.cron.form.script')} field='script'>
            <Input placeholder='watchdog.py' />
          </Form.Item>
          <Form.Item label={t('settings.hermes.cron.form.workdir')} field='workdir'>
            <Input placeholder='/abs/path' />
          </Form.Item>
          <Form.Item label={t('settings.hermes.cron.form.noAgent')} field='no_agent' triggerPropName='checked'>
            <Switch />
          </Form.Item>
          {!editing ? (
            <Form.Item label={t('settings.hermes.cron.form.profile')} field='profile'>
              <Input placeholder='default' />
            </Form.Item>
          ) : null}
        </Form>
      </Drawer>
    </div>
  );
};

export default CronJobsPanel;
