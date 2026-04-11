<script>
  import { onMount } from 'svelte'
  import { storage } from '$lib/storage.js'

  onMount(async () => {
    await storage.init()
    console.log('storage initialized')
  })
</script>

<h1>Hello from Svelte</h1>