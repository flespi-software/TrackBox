import { defineStore } from 'pinia'

export const useCustomerStore = defineStore('customer', {
  state: () => ({
    isLoading: undefined,
    customer: {},
  }),
  actions: {
    reset() {
      this.isLoading = undefined
      this.customer = {}
    },
    async unsubscribeCustomer() {
      this.$connector.socket.unsubscribe(`flespi/state/platform/customer`)
      this.reset()
    },
    async subscribeCustomer() {
      try {
        let that = this
        this.isLoading = true
        await this.$connector.socket.subscribe({
          name: `flespi/state/platform/customer`,
          handler(message, topic, packet) {
            that.customer = JSON.parse(message)
            console.log(that.customer, topic, packet)
          },
        })
        this.isLoading = false
      } catch (e) {
        console.log(e)
      }
    },
  },
})
