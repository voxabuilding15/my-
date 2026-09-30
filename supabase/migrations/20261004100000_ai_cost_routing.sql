-- AI cost (Phase 8 decision): whole-document tools keep up to 150k tokens of context, while
-- chat about any document larger than 30k tokens (about 60–80 pages) answers from the most
-- relevant passages instead of resending the whole text with every question. Documents above
-- the threshold also get embeddings (hybrid retrieval), so those passages are found by meaning
-- as well as by words. Only the shipped default is changed; a value set by an admin is kept.

update public.app_config
set value = jsonb_set(value, '{full_context_max_tokens}', '30000'),
    description = 'Chat sends the whole document only up to full_context_max_tokens; larger '
      || 'documents are chunked with embeddings and chat uses the most relevant passages. '
      || 'Whole-document tools use ai.context.max_context_tokens instead.'
where key = 'retrieval' and value ->> 'full_context_max_tokens' = '100000';

update public.app_config
set description = 'Chat turns sent with each question (history_messages), and the most document '
  || 'text sent in one request by whole-document tools such as summaries, notes, quizzes and '
  || 'full-document analysis (max_context_tokens, 150k by default).'
where key = 'ai.context';
