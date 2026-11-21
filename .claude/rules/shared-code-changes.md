# Changes to Code Used in Several Places

Whenever a change touches something that is also used elsewhere (a shared component, hook, util, type, schema,
API route, style pattern, or a behaviour that other modules/forms repeat in their own copy):

1. Before finishing, search for every other place that uses it or repeats the same pattern.
2. List those places to the user and **ask** whether the same change should be made there too. Do not silently
   apply it everywhere, and do not silently leave the other places behind.
3. Only skip the question when the user's request already says where it applies (e.g. "throughout the
   application", "for all the forms", or "only on this page").
